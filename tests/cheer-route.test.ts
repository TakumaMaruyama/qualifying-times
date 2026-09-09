import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ clicks: [] as Array<{ userHash: string; cheerDate: string }> }));

vi.mock("@/db/client", () => ({
  db: {
    select: (selection: Record<string, unknown>) => ({
      from: () => {
        if ("count" in selection) return Promise.resolve([{ count: state.clicks.length }]);
        return {
          where: () => ({
            limit: () => Promise.resolve(state.clicks.length > 0 ? [{ id: "existing" }] : []),
          }),
        };
      },
    }),
    insert: () => ({
      values: (value: { userHash: string; cheerDate: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (state.clicks.length > 0) return [];
            state.clicks.push(value);
            return [{ id: "new" }];
          },
        }),
      }),
    }),
  },
}));

import { GET, POST } from "@/app/api/cheer/route";

describe("cheer API", () => {
  it("returns status, accepts one click per day, and rejects the duplicate", async () => {
    state.clicks.length = 0;
    const firstStatus = await GET(new NextRequest("https://example.test/api/cheer"));
    const firstBody = await firstStatus.json();
    const cookie = firstStatus.headers.get("set-cookie")?.split(";", 1)[0];

    expect(firstStatus.status).toBe(200);
    expect(firstBody).toMatchObject({ totalCount: 0, canCheer: true });
    expect(cookie).toContain("cheer_user_id=");

    const request = () => new NextRequest("https://example.test/api/cheer", {
      method: "POST",
      headers: { cookie: String(cookie) },
    });
    const accepted = await POST(request());
    expect(await accepted.json()).toMatchObject({ accepted: true, totalCount: 1, canCheer: false });

    const duplicate = await POST(request());
    expect(await duplicate.json()).toMatchObject({ accepted: false, totalCount: 1, canCheer: false });

    const finalStatus = await GET(new NextRequest("https://example.test/api/cheer", { headers: { cookie: String(cookie) } }));
    expect(await finalStatus.json()).toMatchObject({ totalCount: 1, canCheer: false });
  });
});
