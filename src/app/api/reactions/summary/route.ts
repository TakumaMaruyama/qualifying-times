import { type NextRequest, NextResponse } from "next/server";

import { BadRequestError } from "@/lib/errors";
import {
  getReactionsSummary,
  parseReactionsSummaryInput,
} from "@/lib/reactions-service";
import {
  attachReactionActorCookie,
  resolveReactionActorId,
} from "@/lib/reaction-actor";

export async function POST(request: NextRequest) {
  try {
    const actor = resolveReactionActorId(request);
    const body = await request.json();
    const input = parseReactionsSummaryInput(body);
    const summary = await getReactionsSummary(input, actor.actorId);

    const response = NextResponse.json(summary);
    if (actor.shouldSetCookie) {
      attachReactionActorCookie(response, request, actor.actorId);
    }

    return response;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof BadRequestError) {
      return NextResponse.json(
        { error: error.message || "Invalid request body." },
        { status: 400 },
      );
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
