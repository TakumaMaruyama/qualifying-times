import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import {
  normalizeCompareAges,
} from "@/lib/compare-age";
import { db } from "@/db/client";
import { meets, standards } from "@/db/schema";
import {
  courseSchema,
  genderSchema,
  STANDARD_LEVELS,
  type Course,
  type Gender,
  type StandardLevel,
} from "@/lib/domain";
import { BadRequestError } from "@/lib/errors";
import { compareEventCode } from "@/lib/event";
import { formatTimeMs } from "@/lib/time";

export const searchRequestSchema = z.object({
  gender: genderSchema,
  course: courseSchema,
  season: z.number().int().min(1900).max(3000).nullable().optional().default(null),
  targetAges: z.array(z.number().int().min(9).max(17)).optional().default([]),
  compareAges: z.array(z.number().int().min(9).max(17)).optional().default([]),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export type SearchRow = {
  event_code: string;
  age: number;
  time: string;
};

export type SearchMeetResult = {
  meet_id: string;
  meet_name: string;
  meet_season: number;
  meet_course: Course;
  items: SearchRow[];
};

export type SearchResponse = {
  targetAges: number[];
  season: number | null;
  course: Course;
  gender: Gender;
  results: Record<StandardLevel, SearchMeetResult[]>;
};

export function validateSearchRequest(input: unknown): SearchRequest {
  const parsed = searchRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(
      parsed.error.issues.map((issue) => issue.message).join(", "),
    );
  }
  return parsed.data;
}

function resolveSearchCourses(course: Course): Course[] {
  if (course === "ANY") {
    return ["SCM", "LCM", "ANY"];
  }
  return [course, "ANY"];
}

export async function searchStandards(input: SearchRequest): Promise<SearchResponse> {
  const targetAges = normalizeCompareAges([...input.targetAges, ...input.compareAges]);
  if (targetAges.length === 0) {
    throw new BadRequestError("targetAges must include at least one value.");
  }
  const courses = resolveSearchCourses(input.course);
  const season = input.season;
  // Resolve the latest registered edition separately for every meet and course.
  // Choose the edition before filtering ages/gender so removed categories cannot
  // silently fall back to an older standard.
  const editions = alias(meets, "editions");
  const latestEdition = db
    .select({ season: sql<number>`max(${editions.season})` })
    .from(editions)
    .where(
      and(
        eq(editions.level, meets.level),
        eq(editions.name, meets.name),
        eq(editions.course, meets.course),
      ),
    );

  const found = await db
    .select({
      level: meets.level,
      meetId: meets.id,
      meetName: meets.name,
      meetSeason: meets.season,
      meetCourse: meets.course,
      ageMin: standards.ageMin,
      ageMax: standards.ageMax,
      eventCode: standards.eventCode,
      timeMs: standards.timeMs,
    })
    .from(standards)
    .innerJoin(meets, eq(standards.meetId, meets.id))
    .where(
      and(
        eq(meets.season, season ?? latestEdition),
        inArray(meets.course, courses),
        eq(standards.gender, input.gender),
        or(...targetAges.map((age) => and(lte(standards.ageMin, age), gte(standards.ageMax, age)))),
        inArray(meets.level, [...STANDARD_LEVELS]),
      ),
    )
    .orderBy(asc(meets.level), asc(meets.name), asc(standards.eventCode));

  const results: Record<StandardLevel, SearchMeetResult[]> = {
    national: [],
    kyushu: [],
    kagoshima: [],
  };

  const grouped = new Map<string, SearchMeetResult>();
  const seenItemKeys = new Map<string, Set<string>>();

  for (const row of found) {
    const key = `${row.level}|${row.meetId}`;
    let meetGroup = grouped.get(key);

    if (!meetGroup) {
      meetGroup = {
        meet_id: row.meetId,
        meet_name: row.meetName,
        meet_season: row.meetSeason,
        meet_course: row.meetCourse,
        items: [],
      };
      grouped.set(key, meetGroup);
      seenItemKeys.set(key, new Set());
      results[row.level].push(meetGroup);
    }

    const seen = seenItemKeys.get(key);
    if (!seen) {
      continue;
    }

    for (const targetAge of targetAges) {
      if (row.ageMin <= targetAge && row.ageMax >= targetAge) {
        const itemKey = `${row.eventCode}|${targetAge}`;
        if (seen.has(itemKey)) {
          continue;
        }
        seen.add(itemKey);
        meetGroup.items.push({
          event_code: row.eventCode,
          age: targetAge,
          time: formatTimeMs(row.timeMs),
        });
      }
    }
  }

  for (const level of STANDARD_LEVELS) {
    results[level].sort((a, b) => {
      const nameComparison = a.meet_name.localeCompare(b.meet_name);
      if (nameComparison !== 0) {
        return nameComparison;
      }
      const courseComparison = a.meet_course.localeCompare(b.meet_course);
      if (courseComparison !== 0) {
        return courseComparison;
      }
      return a.meet_id.localeCompare(b.meet_id);
    });
    for (const meet of results[level]) {
      meet.items.sort((a, b) => {
        const eventComparison = compareEventCode(a.event_code, b.event_code);
        if (eventComparison !== 0) {
          return eventComparison;
        }
        return a.age - b.age;
      });
    }
  }

  return {
    targetAges,
    season,
    course: input.course,
    gender: input.gender,
    results,
  };
}
