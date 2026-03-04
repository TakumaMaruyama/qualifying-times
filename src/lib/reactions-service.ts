import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { eventLikes, meetLikes, meets, standards } from "@/db/schema";
import { EVENT_CODE_REGEX } from "@/lib/domain";
import { BadRequestError } from "@/lib/errors";

const meetLikeToggleInputSchema = z.object({
  meetId: z.string().uuid(),
});

const eventLikeToggleInputSchema = z.object({
  meetId: z.string().uuid(),
  eventCode: z
    .string()
    .trim()
    .regex(
      EVENT_CODE_REGEX,
      "eventCode must match /^((FR|BK|BR|FL|IM)_\\d{2,4}|(FRR|MRR)_\\dX\\d{2,4})$/",
    ),
});

const reactionsSummaryInputSchema = z.object({
  meetIds: z.array(z.string().uuid()).optional().default([]),
  eventsByMeet: z
    .record(
      z.string().uuid(),
      z.array(
        z
          .string()
          .trim()
          .regex(
            EVENT_CODE_REGEX,
            "eventCode must match /^((FR|BK|BR|FL|IM)_\\d{2,4}|(FRR|MRR)_\\dX\\d{2,4})$/",
          ),
      ),
    )
    .optional()
    .default({}),
});

export type LikeStatus = {
  count: number;
  liked: boolean;
};

export type ReactionsSummaryInput = {
  meetIds: string[];
  eventsByMeet: Record<string, string[]>;
};

export type ReactionsSummary = {
  meetLikes: Record<string, LikeStatus>;
  eventLikes: Record<string, Record<string, LikeStatus>>;
};

export type MeetLikeToggleInput = z.infer<typeof meetLikeToggleInputSchema>;
export type EventLikeToggleInput = z.infer<typeof eventLikeToggleInputSchema>;

export type ToggleMeetLikeResult =
  | {
      status: "ok";
      liked: boolean;
      count: number;
    }
  | {
      status: "meet_not_found";
    };

export type ToggleEventLikeResult =
  | {
      status: "ok";
      liked: boolean;
      count: number;
    }
  | {
      status: "meet_not_found";
    }
  | {
      status: "event_not_found";
    };

function issuesToMessage(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getPairKey(meetId: string, eventCode: string): string {
  return `${meetId}|${eventCode}`;
}

async function checkMeetExists(meetId: string): Promise<boolean> {
  const rows = await db
    .select({ id: meets.id })
    .from(meets)
    .where(eq(meets.id, meetId))
    .limit(1);

  return rows.length > 0;
}

async function checkMeetEventExists(meetId: string, eventCode: string): Promise<boolean> {
  const rows = await db
    .select({ id: standards.id })
    .from(standards)
    .where(and(eq(standards.meetId, meetId), eq(standards.eventCode, eventCode)))
    .limit(1);

  return rows.length > 0;
}

async function countMeetLikes(meetId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(meetLikes)
    .where(eq(meetLikes.meetId, meetId));

  return Number(rows[0]?.count ?? 0);
}

async function countEventLikes(meetId: string, eventCode: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(eventLikes)
    .where(and(eq(eventLikes.meetId, meetId), eq(eventLikes.eventCode, eventCode)));

  return Number(rows[0]?.count ?? 0);
}

export function parseMeetLikeToggleInput(input: unknown): MeetLikeToggleInput {
  const parsed = meetLikeToggleInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(issuesToMessage(parsed.error.issues));
  }
  return parsed.data;
}

export function parseEventLikeToggleInput(input: unknown): EventLikeToggleInput {
  const parsed = eventLikeToggleInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(issuesToMessage(parsed.error.issues));
  }
  return parsed.data;
}

export function parseReactionsSummaryInput(input: unknown): ReactionsSummaryInput {
  const parsed = reactionsSummaryInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(issuesToMessage(parsed.error.issues));
  }

  const meetIds = uniqueStrings([...parsed.data.meetIds, ...Object.keys(parsed.data.eventsByMeet)]);
  const eventsByMeet: Record<string, string[]> = {};

  for (const meetId of meetIds) {
    eventsByMeet[meetId] = uniqueStrings(parsed.data.eventsByMeet[meetId] ?? []);
  }

  return { meetIds, eventsByMeet };
}

export async function toggleMeetLike(
  input: MeetLikeToggleInput,
  actorId: string,
): Promise<ToggleMeetLikeResult> {
  const meetExists = await checkMeetExists(input.meetId);
  if (!meetExists) {
    return { status: "meet_not_found" };
  }

  const inserted = await db
    .insert(meetLikes)
    .values({
      meetId: input.meetId,
      actorId,
    })
    .onConflictDoNothing({
      target: [meetLikes.meetId, meetLikes.actorId],
    })
    .returning({ id: meetLikes.id });

  let liked = false;
  if (inserted.length > 0) {
    liked = true;
  } else {
    await db
      .delete(meetLikes)
      .where(and(eq(meetLikes.meetId, input.meetId), eq(meetLikes.actorId, actorId)));
  }

  return {
    status: "ok",
    liked,
    count: await countMeetLikes(input.meetId),
  };
}

export async function toggleEventLike(
  input: EventLikeToggleInput,
  actorId: string,
): Promise<ToggleEventLikeResult> {
  const meetExists = await checkMeetExists(input.meetId);
  if (!meetExists) {
    return { status: "meet_not_found" };
  }

  const meetEventExists = await checkMeetEventExists(input.meetId, input.eventCode);
  if (!meetEventExists) {
    return { status: "event_not_found" };
  }

  const inserted = await db
    .insert(eventLikes)
    .values({
      meetId: input.meetId,
      eventCode: input.eventCode,
      actorId,
    })
    .onConflictDoNothing({
      target: [eventLikes.meetId, eventLikes.eventCode, eventLikes.actorId],
    })
    .returning({ id: eventLikes.id });

  let liked = false;
  if (inserted.length > 0) {
    liked = true;
  } else {
    await db.delete(eventLikes).where(
      and(
        eq(eventLikes.meetId, input.meetId),
        eq(eventLikes.eventCode, input.eventCode),
        eq(eventLikes.actorId, actorId),
      ),
    );
  }

  return {
    status: "ok",
    liked,
    count: await countEventLikes(input.meetId, input.eventCode),
  };
}

export async function getReactionsSummary(
  input: ReactionsSummaryInput,
  actorId: string,
): Promise<ReactionsSummary> {
  const meetLikesOutput: Record<string, LikeStatus> = {};
  const eventLikesOutput: Record<string, Record<string, LikeStatus>> = {};

  if (input.meetIds.length === 0) {
    return { meetLikes: meetLikesOutput, eventLikes: eventLikesOutput };
  }

  const meetCountRows = await db
    .select({
      meetId: meetLikes.meetId,
      count: sql<number>`count(*)`,
    })
    .from(meetLikes)
    .where(inArray(meetLikes.meetId, input.meetIds))
    .groupBy(meetLikes.meetId);

  const meetLikedRows = await db
    .select({
      meetId: meetLikes.meetId,
    })
    .from(meetLikes)
    .where(and(eq(meetLikes.actorId, actorId), inArray(meetLikes.meetId, input.meetIds)));

  const requestedEventPairs: Array<{ meetId: string; eventCode: string }> = [];
  for (const meetId of input.meetIds) {
    for (const eventCode of input.eventsByMeet[meetId] ?? []) {
      requestedEventPairs.push({ meetId, eventCode });
    }
  }

  const requestedEventCodes = uniqueStrings(requestedEventPairs.map((pair) => pair.eventCode));

  const eventCountRows =
    requestedEventPairs.length === 0
      ? []
      : await db
          .select({
            meetId: eventLikes.meetId,
            eventCode: eventLikes.eventCode,
            count: sql<number>`count(*)`,
          })
          .from(eventLikes)
          .where(
            and(
              inArray(eventLikes.meetId, input.meetIds),
              inArray(eventLikes.eventCode, requestedEventCodes),
            ),
          )
          .groupBy(eventLikes.meetId, eventLikes.eventCode);

  const eventLikedRows =
    requestedEventPairs.length === 0
      ? []
      : await db
          .select({
            meetId: eventLikes.meetId,
            eventCode: eventLikes.eventCode,
          })
          .from(eventLikes)
          .where(
            and(
              eq(eventLikes.actorId, actorId),
              inArray(eventLikes.meetId, input.meetIds),
              inArray(eventLikes.eventCode, requestedEventCodes),
            ),
          );

  const meetCounts = new Map<string, number>();
  for (const row of meetCountRows) {
    meetCounts.set(row.meetId, Number(row.count));
  }

  const likedMeets = new Set(meetLikedRows.map((row) => row.meetId));

  const eventCounts = new Map<string, number>();
  for (const row of eventCountRows) {
    eventCounts.set(getPairKey(row.meetId, row.eventCode), Number(row.count));
  }

  const likedEvents = new Set(eventLikedRows.map((row) => getPairKey(row.meetId, row.eventCode)));

  for (const meetId of input.meetIds) {
    meetLikesOutput[meetId] = {
      count: meetCounts.get(meetId) ?? 0,
      liked: likedMeets.has(meetId),
    };

    const perMeetEventLikes: Record<string, LikeStatus> = {};
    for (const eventCode of input.eventsByMeet[meetId] ?? []) {
      const key = getPairKey(meetId, eventCode);
      perMeetEventLikes[eventCode] = {
        count: eventCounts.get(key) ?? 0,
        liked: likedEvents.has(key),
      };
    }

    eventLikesOutput[meetId] = perMeetEventLikes;
  }

  return {
    meetLikes: meetLikesOutput,
    eventLikes: eventLikesOutput,
  };
}
