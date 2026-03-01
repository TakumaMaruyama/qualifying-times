import crypto from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "admin_auth";

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
  const cookieValue = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!cookieValue) {
    return false;
  }

  try {
    return cookieValue === buildAdminCookieValue();
  } catch {
    return false;
  }
}