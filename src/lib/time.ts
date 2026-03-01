const SECONDS_ONLY_PATTERN = /^(\d{1,3})\.(\d{2})$/;
const MINUTE_SECONDS_PATTERN = /^(\d{1,2}):([0-5]\d)\.(\d{2})$/;

export function parseTimeToMs(value: string): number | null {
  const input = value.trim();

  const minuteMatch = MINUTE_SECONDS_PATTERN.exec(input);
  if (minuteMatch) {
    const minutes = Number.parseInt(minuteMatch[1], 10);
    const seconds = Number.parseInt(minuteMatch[2], 10);
    const hundredths = Number.parseInt(minuteMatch[3], 10);
    return (minutes * 60 + seconds) * 1000 + hundredths * 10;
  }

  const secondMatch = SECONDS_ONLY_PATTERN.exec(input);
  if (secondMatch) {
    const seconds = Number.parseInt(secondMatch[1], 10);
    const hundredths = Number.parseInt(secondMatch[2], 10);
    return seconds * 1000 + hundredths * 10;
  }

  return null;
}

export function formatTimeMs(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    return "--:--.--";
  }

  const totalHundredths = Math.round(timeMs / 10);
  const minutes = Math.floor(totalHundredths / 6000);
  const seconds = Math.floor((totalHundredths % 6000) / 100);
  const hundredths = totalHundredths % 100;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${hundredths.toString().padStart(2, "0")}`;
}