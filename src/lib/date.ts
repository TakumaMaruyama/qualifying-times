export type DateParts = {
  year: number;
  month: number;
  day: number;
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  if (year % 400 === 0) {
    return true;
  }
  if (year % 100 === 0) {
    return false;
  }
  return year % 4 === 0;
}

function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

export function parseIsoDateOnly(input: string): DateParts | null {
  const match = ISO_DATE_PATTERN.exec(input.trim());
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    return null;
  }

  const daysInMonth = getDaysInMonth(year, month);
  if (day < 1 || day > daysInMonth) {
    return null;
  }

  return { year, month, day };
}

export function calculateFullAge(birthDate: DateParts, meetDate: DateParts): number {
  let age = meetDate.year - birthDate.year;

  if (
    meetDate.month < birthDate.month ||
    (meetDate.month === birthDate.month && meetDate.day < birthDate.day)
  ) {
    age -= 1;
  }

  if (age < 0) {
    throw new Error("birthDate must not be after meetDate");
  }

  return age;
}

export function toIsoDateString(parts: DateParts): string {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}