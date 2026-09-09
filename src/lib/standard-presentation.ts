import { type Course, type StandardLevel } from "@/lib/domain";
import { parseTimeToMs } from "@/lib/time";

export type SearchMeetResult = {
  meet_id: string;
  meet_name: string;
  meet_season: number;
  meet_course: Course;
  items: Array<{ event_code: string; age: number; time: string }>;
};

export type MeetGroup = {
  key: string;
  name: string;
  courses: SearchMeetResult[];
};

const COURSE_ORDER: Record<Course, number> = {
  LCM: 0,
  SCM: 1,
  ANY: 2,
};

function isNewerMeet(candidate: SearchMeetResult, current: SearchMeetResult): boolean {
  return candidate.meet_season > current.meet_season;
}

export function groupMeets(level: StandardLevel, meets: SearchMeetResult[]): MeetGroup[] {
  const grouped = new Map<string, MeetGroup>();

  for (const meet of meets) {
    const key = `${level}:${meet.meet_name}`;
    const group = grouped.get(key);

    if (!group) {
      grouped.set(key, { key, name: meet.meet_name, courses: [meet] });
      continue;
    }

    const existingIndex = group.courses.findIndex(
      (candidate) => candidate.meet_course === meet.meet_course,
    );
    if (existingIndex === -1) {
      group.courses.push(meet);
      continue;
    }

    if (isNewerMeet(meet, group.courses[existingIndex])) {
      group.courses[existingIndex] = meet;
    }
  }

  return [...grouped.values()].map((group) => ({
    ...group,
    courses: [...group.courses].sort(
      (left, right) => COURSE_ORDER[left.meet_course] - COURSE_ORDER[right.meet_course],
    ),
  }));
}

export function resolveGroupCourse(group: MeetGroup, preferred?: Course): SearchMeetResult {
  if (preferred) {
    const preferredCourse = group.courses.find((course) => course.meet_course === preferred);
    if (preferredCourse) {
      return preferredCourse;
    }
  }

  for (const course of ["LCM", "SCM", "ANY"] as const) {
    const availableCourse = group.courses.find((candidate) => candidate.meet_course === course);
    if (availableCourse) {
      return availableCourse;
    }
  }

  throw new Error("Meet group must contain at least one course.");
}

export function formatStandardTime(value: string): string {
  const timeMs = parseTimeToMs(value);
  if (timeMs === null) {
    return "—";
  }

  const totalHundredths = Math.round(timeMs / 10);
  const minutes = Math.floor(totalHundredths / 6000);
  const seconds = Math.floor((totalHundredths % 6000) / 100);
  const hundredths = totalHundredths % 100;
  const suffix = `${seconds.toString().padStart(2, "0")}.${hundredths
    .toString()
    .padStart(2, "0")}`;

  return minutes === 0
    ? `${seconds}.${hundredths.toString().padStart(2, "0")}`
    : `${minutes}:${suffix}`;
}
