import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const REACTION_ACTOR_COOKIE_NAME = "reaction_actor_id";

const actorIdSchema = z.string().uuid();
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type ReactionActor = {
  actorId: string;
  shouldSetCookie: boolean;
};

function resolveCookieSecure(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.toLowerCase().includes("https");
  }
  return request.nextUrl.protocol === "https:";
}

export function resolveReactionActorId(request: NextRequest): ReactionActor {
  const cookieValue = request.cookies.get(REACTION_ACTOR_COOKIE_NAME)?.value;
  const parsed = actorIdSchema.safeParse(cookieValue);
  if (parsed.success) {
    return {
      actorId: parsed.data,
      shouldSetCookie: false,
    };
  }

  return {
    actorId: randomUUID(),
    shouldSetCookie: true,
  };
}

export function attachReactionActorCookie(
  response: NextResponse,
  request: NextRequest,
  actorId: string,
): void {
  response.cookies.set({
    name: REACTION_ACTOR_COOKIE_NAME,
    value: actorId,
    httpOnly: true,
    sameSite: "lax",
    secure: resolveCookieSecure(request),
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}
