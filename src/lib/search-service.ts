import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { meets, standards } from "@/db/schema";
import { calculateFullAge, parseIsoDateOnly } from "@/lib/date";
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
import { resolveSeason } from "@/lib/season";
import { formatTimeMs } from "@/lib/time";

export const searchRequestSchema = z.object({
  gender: genderSchema,
  birthDate: z.string(),
  meetDate: z.string(),
  course: courseSchema,
  season: z.number().int().min(1900).max(3000).nullable(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export type SearchRow = {
  event_code: string;
  time: string;
};

export type SearchMeetResult = {
  meet_id: string;
  meet_name: string;
  meet_metadata: Record<string, unknown> | null;
  items: SearchRow[];
};

export type SearchResponse = {
  age: number;
  season: number;
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

export async function searchStandards(input: SearchRequest): Promise<SearchResponse> {
  const birthDate = parseIsoDateOnly(input.birthDate);
  if (!birthDate) {
    throw new BadRequestError("birthDate must be YYYY-MM-DD.");
  }

  const meetDate = parseIsoDateOnly(input.meetDate);
  if (!meetDate) {
    throw new BadRequestError("meetDate must be YYYY-MM-DD.");
  }

  const age = calculateFullAge(birthDate, meetDate);
  const season = resolveSeason(input.season, meetDate);

  const found = await db
    .select({
      level: meets.level,
      meetId: meets.id,
      meetName: meets.name,
      meetMetadata: meets.metadataJson,
      eventCode: standards.eventCode,
      timeMs: standards.timeMs,
    })
    .from(standards)
    .innerJoin(meets, eq(standards.meetId, meets.id))
    .where(
      and(
        eq(meets.season, season),
        eq(meets.course, input.course),
        eq(standards.gender, input.gender),
        lte(standards.ageMin, age),
        gte(standards.ageMax, age),
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

  for (const row of found) {
    const key = `${row.level}|${row.meetId}`;
    let meetGroup = grouped.get(key);

    if (!meetGroup) {
      meetGroup = {
        meet_id: row.meetId,
        meet_name: row.meetName,
        meet_metadata: (row.meetMetadata ?? null) as Record<string, unknown> | null,
        items: [],
      };
      grouped.set(key, meetGroup);
      results[row.level].push(meetGroup);
    }

    meetGroup.items.push({
      event_code: row.eventCode,
      time: formatTimeMs(row.timeMs),
    });
  }

  for (const level of STANDARD_LEVELS) {
    results[level].sort((a, b) => a.meet_name.localeCompare(b.meet_name));
    for (const meet of results[level]) {
      meet.items.sort((a, b) => compareEventCode(a.event_code, b.event_code));
    }
  }

  return {
    age,
    season,
    course: input.course,
    gender: input.gender,
    results,
  };
}
