import {
  COURSES,
  STANDARD_LEVELS,
  type Course,
  type StandardLevel,
} from "@/lib/domain";

export const STANDARD_VIEW_PREFERENCES_STORAGE_KEY = "standard_view_preferences_v1";

export type StandardViewPreferences = {
  level: StandardLevel;
  meetByLevel: Partial<Record<StandardLevel, string>>;
  courseByMeet: Record<string, Course>;
};

function defaults(): StandardViewPreferences {
  return { level: "national", meetByLevel: {}, courseByMeet: {} };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLevel(value: unknown): value is StandardLevel {
  return typeof value === "string" && STANDARD_LEVELS.includes(value as StandardLevel);
}

function isCourse(value: unknown): value is Course {
  return typeof value === "string" && COURSES.includes(value as Course);
}

function normalizePreferences(value: unknown): StandardViewPreferences {
  if (!isObject(value)) {
    return defaults();
  }

  const meetByLevel: Partial<Record<StandardLevel, string>> = {};
  if (isObject(value.meetByLevel)) {
    for (const [level, key] of Object.entries(value.meetByLevel)) {
      if (isLevel(level) && typeof key === "string" && key.length > 0) {
        meetByLevel[level] = key;
      }
    }
  }

  const courseByMeet: Record<string, Course> = {};
  if (isObject(value.courseByMeet)) {
    for (const [meetKey, course] of Object.entries(value.courseByMeet)) {
      if (meetKey.length > 0 && isCourse(course)) {
        courseByMeet[meetKey] = course;
      }
    }
  }

  return {
    level: isLevel(value.level) ? value.level : "national",
    meetByLevel,
    courseByMeet,
  };
}

export function readViewPreferences(): StandardViewPreferences {
  if (typeof window === "undefined") {
    return defaults();
  }

  try {
    const raw = window.localStorage.getItem(STANDARD_VIEW_PREFERENCES_STORAGE_KEY);
    return raw ? normalizePreferences(JSON.parse(raw) as unknown) : defaults();
  } catch {
    return defaults();
  }
}

export function writeViewPreferences(value: StandardViewPreferences): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      STANDARD_VIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizePreferences(value)),
    );
  } catch {
    // Local storage can be disabled or unavailable in private browsing modes.
  }
}
