import { z } from "zod";
import { NextResponse } from "next/server";

import {
  ADMIN_COOKIE_NAME,
  buildAdminCookieValue,
  getAdminPassword,
} from "@/lib/admin-auth";

const loginSchema = z.object({
  password: z.string().min(1, "password is required."),
});

export async function POST(request: Request) {
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

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: buildAdminCookieValue(),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
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
