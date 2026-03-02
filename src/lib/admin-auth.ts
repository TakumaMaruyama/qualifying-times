import crypto from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "admin_auth";
export const ADMIN_TOKEN_HEADER = "x-admin-token";

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD is not set.");
  }
  return password;
}

export function buildAdminCookieValue(): string {
  return hashValue(getAdminPassword());
}

export function isAdminRequest(request: NextRequest): boolean {
  try {
    const expected = buildAdminCookieValue();
    const cookieValue = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const headerValue = request.headers.get(ADMIN_TOKEN_HEADER);
    return cookieValue === expected || headerValue === expected;
  } catch {
    return false;
  }
}
