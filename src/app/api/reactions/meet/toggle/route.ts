import { type NextRequest, NextResponse } from "next/server";

import { BadRequestError } from "@/lib/errors";
import {
  parseMeetLikeToggleInput,
  toggleMeetLike,
} from "@/lib/reactions-service";
import {
  attachReactionActorCookie,
  resolveReactionActorId,
} from "@/lib/reaction-actor";

export async function POST(request: NextRequest) {
  try {
    const actor = resolveReactionActorId(request);
    const body = await request.json();
    const input = parseMeetLikeToggleInput(body);
    const result = await toggleMeetLike(input, actor.actorId);

    if (result.status === "meet_not_found") {
      return NextResponse.json({ error: "Meet not found." }, { status: 404 });
    }

    const response = NextResponse.json({
      meetId: input.meetId,
      liked: result.liked,
      count: result.count,
    });

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
