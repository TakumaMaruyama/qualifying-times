import { describe, expect, it } from "vitest";

import {
  formatStandardTime,
  groupMeets,
  resolveGroupCourse,
  type SearchMeetResult,
} from "@/lib/standard-presentation";

function meet(
  meetId: string,
  meetName: string,
  meetSeason: number,
  meetCourse: SearchMeetResult["meet_course"],
): SearchMeetResult {
  return {
    meet_id: meetId,
    meet_name: meetName,
    meet_season: meetSeason,
    meet_course: meetCourse,
    items: [{ event_code: "FR_50", age: 12, time: "29.80" }],
  };
}

describe("groupMeets", () => {
  it("keeps first-seen meet order, chooses the newest duplicate course, and orders courses", () => {
    const input = [
      meet("spring-scm-2025", "春季JO", 2025, "SCM"),
      meet("spring-any", "春季JO", 2025, "ANY"),
      meet("regional-scm", "九州カップ", 2026, "SCM"),
      meet("spring-lcm", "春季JO", 2026, "LCM"),
      meet("spring-scm-2026", "春季JO", 2026, "SCM"),
    ];
    const before = input.map((value) => value.meet_id);

    const groups = groupMeets("national", input);

    expect(groups.map((group) => group.name)).toEqual(["春季JO", "九州カップ"]);
    expect(groups[0]).toMatchObject({ key: "national:春季JO", name: "春季JO" });
    expect(groups[0].courses.map((value) => value.meet_id)).toEqual([
      "spring-lcm",
      "spring-scm-2026",
      "spring-any",
    ]);
    expect(input.map((value) => value.meet_id)).toEqual(before);
  });

  it("includes level in the stable group key", () => {
    const results = [meet("same-name", "選手権", 2026, "LCM")];

    expect(groupMeets("national", results)[0].key).toBe("national:選手権");
    expect(groupMeets("kyushu", results)[0].key).toBe("kyushu:選手権");
  });
});

describe("resolveGroupCourse", () => {
  it("uses the preferred course when available", () => {
    const group = groupMeets("national", [
      meet("scm", "選手権", 2026, "SCM"),
      meet("lcm", "選手権", 2026, "LCM"),
    ])[0];

    expect(resolveGroupCourse(group, "SCM").meet_id).toBe("scm");
  });

  it("falls back in LCM, SCM, ANY order when the preferred course is absent", () => {
    const withLongCourse = groupMeets("national", [
      meet("any", "選手権", 2026, "ANY"),
      meet("lcm", "選手権", 2026, "LCM"),
    ])[0];
    const shortOnly = groupMeets("national", [meet("scm", "別大会", 2026, "SCM")])[0];

    expect(resolveGroupCourse(withLongCourse, "SCM").meet_id).toBe("lcm");
    expect(resolveGroupCourse(shortOnly, "ANY").meet_id).toBe("scm");
  });
});

describe("formatStandardTime", () => {
  it("removes zero minutes while preserving hundredths and minute values", () => {
    expect(formatStandardTime("00:34.19")).toBe("34.19");
    expect(formatStandardTime("00:09.05")).toBe("9.05");
    expect(formatStandardTime("01:14.59")).toBe("1:14.59");
    expect(formatStandardTime("10:00.00")).toBe("10:00.00");
  });

  it("uses an em dash for invalid values", () => {
    expect(formatStandardTime("")).toBe("—");
    expect(formatStandardTime("1:60.00")).toBe("—");
    expect(formatStandardTime("34.1")).toBe("—");
  });
});
