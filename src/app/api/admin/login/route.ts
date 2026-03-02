import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";

import {
  ADMIN_COOKIE_NAME,
  buildAdminCookieValue,
  getAdminPassword,
} from "@/lib/admin-auth";

const loginSchema = z.object({
  password: z.string().min(1, "password is required."),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const adminPassword = getAdminPassword();
    if (parsed.data.password !== adminPassword) {
      return NextResponse.json({ error: "Password is incorrect." }, { status: 401 });
    }

    const token = buildAdminCookieValue();
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const secure = forwardedProto
      ? forwardedProto.toLowerCase().includes("https")
      : request.nextUrl.protocol === "https:";

    const response = NextResponse.json({ ok: true, token });
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
