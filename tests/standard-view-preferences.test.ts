import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readViewPreferences,
  STANDARD_VIEW_PREFERENCES_STORAGE_KEY,
  writeViewPreferences,
} from "@/lib/standard-view-preferences";

const defaults = { level: "national" as const, meetByLevel: {}, courseByMeet: {} };

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("view preferences storage", () => {
  it("returns defaults when storage is empty or contains broken JSON", () => {
    expect(readViewPreferences()).toEqual(defaults);

    window.localStorage.setItem(STANDARD_VIEW_PREFERENCES_STORAGE_KEY, "{not-json");
    expect(readViewPreferences()).toEqual(defaults);
  });

  it("drops invalid saved levels and courses while retaining valid choices", () => {
    window.localStorage.setItem(
      STANDARD_VIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        level: "not-a-level",
        meetByLevel: { national: "national:日本選手権", unknown: "bad", kyushu: 4 },
        courseByMeet: {
          "national:日本選手権": "bad-course",
          "kyushu:九州カップ": "LCM",
        },
      }),
    );

    expect(readViewPreferences()).toEqual({
      level: "national",
      meetByLevel: { national: "national:日本選手権" },
      courseByMeet: { "kyushu:九州カップ": "LCM" },
    });
  });

  it("writes normalized values that can be read back", () => {
    const preferences = {
      level: "kyushu" as const,
      meetByLevel: { kyushu: "kyushu:九州カップ" },
      courseByMeet: { "kyushu:九州カップ": "SCM" as const },
    };

    writeViewPreferences(preferences);

    expect(readViewPreferences()).toEqual(preferences);
    expect(window.localStorage.getItem(STANDARD_VIEW_PREFERENCES_STORAGE_KEY)).toBe(
      JSON.stringify(preferences),
    );
  });

  it("handles unavailable localStorage without throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(readViewPreferences()).toEqual(defaults);

    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(() => writeViewPreferences(defaults)).not.toThrow();
  });
});
