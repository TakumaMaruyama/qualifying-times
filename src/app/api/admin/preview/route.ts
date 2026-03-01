import { type NextRequest, NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/admin-auth";
import { BadRequestError } from "@/lib/errors";
import { buildImportPreview, validateAdminImportRequest } from "@/lib/import-service";

export async function POST(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const input = validateAdminImportRequest(body);
    const preview = await buildImportPreview(input);

    return NextResponse.json(preview);
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
