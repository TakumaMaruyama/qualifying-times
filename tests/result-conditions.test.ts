import { describe, expect, it } from "vitest";

import { buildResultQuery, parseResultConditions } from "@/lib/result-conditions";

describe("result conditions", () => {
  const saved = { playerName: "山田", gender: "F" as const, course: "LCM" as const, season: "2025", targetAges: [11, 13] };

  it("restores a complete saved input only when the URL has no explicit condition", () => {
    expect(parseResultConditions("", saved)).toEqual({
      conditions: { gender: "F", course: "LCM", targetAges: [11, 13] },
      error: null,
    });
    expect(parseResultConditions("gender=M&targetAges=12", saved)).toEqual({
      conditions: { gender: "M", course: "ANY", targetAges: [12] },
      error: null,
    });
  });

  it("supports the legacy compareAges parameter and rejects malformed explicit conditions", () => {
    expect(parseResultConditions("gender=F&course=SCM&compareAges=13,11,13")).toEqual({
      conditions: { gender: "F", course: "SCM", targetAges: [11, 13] },
      error: null,
    });
    expect(parseResultConditions("gender=X&course=POOL&targetAges=8,12")).toEqual({
      conditions: { gender: "M", course: "ANY", targetAges: [] },
      error: "検索条件を読み取れませんでした。性別と年齢を選び直してください。",
    });
  });

  it("defaults missing ages to all, while preserving explicit empty and selected ages", () => {
    expect(parseResultConditions("").conditions.targetAges).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(parseResultConditions("gender=F").conditions.targetAges).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(parseResultConditions("gender=F&targetAges=", saved).conditions.targetAges).toEqual([]);
    expect(parseResultConditions("gender=M&targetAges=12", saved).conditions.targetAges).toEqual([12]);
  });

  it("omits ANY from the canonical URL but keeps an explicit course", () => {
    expect(buildResultQuery({ gender: "M", course: "ANY", targetAges: [9, 11] })).toBe("gender=M&targetAges=9%2C11");
    expect(buildResultQuery({ gender: "F", course: "SCM", targetAges: [12] })).toBe("gender=F&targetAges=12&course=SCM");
  });
});
