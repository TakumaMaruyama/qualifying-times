import { type Course } from "@/lib/domain";

export const COURSE_LABELS: Record<Course, string> = {
  SCM: "短水路 (25m)",
  LCM: "長水路 (50m)",
  ANY: "短水路・長水路共通",
};

export const COURSE_ANY_DESCRIPTION =
  "「短水路・長水路共通」は、短水路・長水路のどちらかの記録で標準記録を突破していれば可。";

export function formatCourseStandardRecordLabel(course: Course): string {
  return `${COURSE_LABELS[course]}の標準記録`;
}
