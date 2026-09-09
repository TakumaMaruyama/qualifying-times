import { COURSES, type Course, type Gender } from "@/lib/domain";
import { COMPARE_AGE_OPTIONS, normalizeCompareAges } from "@/lib/compare-age";
import type { StoredSearchInput } from "@/lib/search-history";

export type ResultConditions = { gender: Gender; course: Course; targetAges: number[] };

export function parseResultConditions(query: string, saved: StoredSearchInput | null = null): {
  conditions: ResultConditions;
  error: string | null;
} {
  const params = new URLSearchParams(query);
  const hasConditions = ["gender", "course", "targetAges", "compareAges"].some((key) => params.has(key));
  if (!hasConditions && saved) {
    return { conditions: { gender: saved.gender, course: saved.course, targetAges: saved.targetAges }, error: null };
  }
  const gender = params.get("gender") ?? "M";
  const course = params.get("course") || "ANY";
  const ages = (params.get("targetAges") ?? params.get("compareAges") ?? COMPARE_AGE_OPTIONS.join(",")).split(",").map((age) => age.trim()).filter(Boolean);
  const validAges = ages.every((age) => /^\d+$/.test(age) && Number(age) >= 9 && Number(age) <= 17);
  const validGender = gender === "M" || gender === "F";
  const validCourse = COURSES.includes(course as Course);
  return {
    conditions: {
      gender: validGender ? gender : "M",
      course: validCourse ? course as Course : "ANY",
      targetAges: validAges ? normalizeCompareAges(ages.map(Number)) : [],
    },
    error: !validGender || !validCourse || !validAges ? "検索条件を読み取れませんでした。性別と年齢を選び直してください。" : null,
  };
}

export function buildResultQuery(conditions: ResultConditions): string {
  const params = new URLSearchParams({ gender: conditions.gender, targetAges: conditions.targetAges.join(",") });
  if (conditions.course !== "ANY") params.set("course", conditions.course);
  return params.toString();
}
