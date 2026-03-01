import { NextResponse } from "next/server";

import { BadRequestError } from "@/lib/errors";
import { searchStandards, validateSearchRequest } from "@/lib/search-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = validateSearchRequest(body);
    const result = await searchStandards(input);
    return NextResponse.json(result);
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
