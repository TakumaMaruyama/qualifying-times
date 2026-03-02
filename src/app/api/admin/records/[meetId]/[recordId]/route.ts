import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { standards } from "@/db/schema";
import { isAdminRequest } from "@/lib/admin-auth";
import { parseAdminRecordUpsertInput, parseUuid } from "@/lib/admin-records-service";
import { BadRequestError } from "@/lib/errors";
import { formatTimeMs } from "@/lib/time";

type RouteContext = {
  params: Promise<{ meetId: string; recordId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const params = await context.params;
    const meetId = parseUuid(params.meetId, "meetId");
    const recordId = parseUuid(params.recordId, "recordId");

    const body = await request.json();
    const input = parseAdminRecordUpsertInput(body);

    const updated = await db
      .update(standards)
      .set({
        gender: input.gender,
        ageMin: input.age_min,
        ageMax: input.age_max,
        eventCode: input.event_code,
        timeMs: input.time_ms,
        updatedAt: sql`now()`,
      })
      .where(and(eq(standards.id, recordId), eq(standards.meetId, meetId)))
      .returning({
        id: standards.id,
        gender: standards.gender,
        ageMin: standards.ageMin,
        ageMax: standards.ageMax,
        eventCode: standards.eventCode,
        timeMs: standards.timeMs,
      });

    const row = updated[0];
    if (!row) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    return NextResponse.json({
      record: {
        id: row.id,
        gender: row.gender,
        age_min: row.ageMin,
        age_max: row.ageMax,
        event_code: row.eventCode,
        time: formatTimeMs(row.timeMs),
        time_ms: row.timeMs,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const maybeError = error as { code?: string; detail?: string };
    if (maybeError.code === "23505") {
      return NextResponse.json(
        {
          error:
            "同一大会内で gender/age_min/age_max/event_code が重複しています。別の行を編集してください。",
        },
        { status: 409 },
      );
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const params = await context.params;
    const meetId = parseUuid(params.meetId, "meetId");
    const recordId = parseUuid(params.recordId, "recordId");

    const deleted = await db
      .delete(standards)
      .where(and(eq(standards.id, recordId), eq(standards.meetId, meetId)))
      .returning({ id: standards.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deletedId: deleted[0].id });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
