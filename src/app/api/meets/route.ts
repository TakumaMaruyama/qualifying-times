import { and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db/client";
import { meets } from "@/db/schema";
import { parseAdminRecordsFilter } from "@/lib/admin-records-service";
import { BadRequestError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const filter = parseAdminRecordsFilter({
      level: request.nextUrl.searchParams.get("level"),
      season: request.nextUrl.searchParams.get("season"),
      course: request.nextUrl.searchParams.get("course"),
    });

    const rows = await db
      .select({
        id: meets.id,
        name: meets.name,
        level: meets.level,
        season: meets.season,
        course: meets.course,
        meetDate: meets.meetDate,
        meetDateEnd: meets.meetEndDate,
        metadata: meets.metadataJson,
      })
      .from(meets)
      .where(
        and(
          eq(meets.level, filter.level),
          filter.season === null ? undefined : eq(meets.season, filter.season),
          filter.course === null || filter.course === "ANY"
            ? undefined
            : eq(meets.course, filter.course),
        ),
      )
      .orderBy(
        asc(meets.meetDate),
        asc(meets.meetEndDate),
        asc(meets.name),
        asc(meets.course),
      );

    return NextResponse.json({
      meets: rows.map((row) => ({
        id: row.id,
        name: row.name,
        level: row.level,
        season: row.season,
        course: row.course,
        meetDate: row.meetDate,
        meetDateEnd: row.meetDateEnd,
        metadata: (row.metadata ?? null) as Record<string, unknown> | null,
      })),
    });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
