import type { DateParts } from "@/lib/date";

export function deriveSeasonFromMeetDate(meetDate: DateParts): number {
  return meetDate.year;
}

export function resolveSeason(season: number | null, meetDate: DateParts): number {
  if (season !== null) {
    return season;
  }
  return deriveSeasonFromMeetDate(meetDate);
}