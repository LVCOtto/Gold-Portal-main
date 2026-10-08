const boardDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function calendarDay(date: Date): number {
  const parts = boardDateFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000;
}

export function getWorkshopAgeDays(
  firstAddedAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!firstAddedAt || Number.isNaN(now.getTime())) {
    return null;
  }

  const firstAdded = new Date(firstAddedAt);
  if (Number.isNaN(firstAdded.getTime()) || firstAdded.getTime() > now.getTime()) {
    return null;
  }

  return calendarDay(now) - calendarDay(firstAdded);
}

export function getWorkshopAgeBand(days: number | null): "neutral" | "30" | "60" | "90" {
  if (days === null || days < 30) return "neutral";
  if (days < 60) return "30";
  if (days < 90) return "60";
  return "90";
}

export function formatWorkshopBoardDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : boardDateFormatter.format(date);
}
