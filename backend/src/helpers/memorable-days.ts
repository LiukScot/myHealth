export type MemorableRepeatMode = "one-time" | "monthly" | "yearly";

export type MemorableDayRecord = {
  id: number;
  date: string;
  title: string;
  emoji: string;
  description: string;
  repeatMode: MemorableRepeatMode;
  createdAt: string;
  updatedAt: string;
};

export type MemorableDayView = MemorableDayRecord & {
  locked: boolean;
  source: "user" | "birthday";
  occurrenceLabel: string;
  occurrenceCount: number | null;
};

function parseDateParts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function matchesMemorableDate(anchorDate: string, repeatMode: MemorableRepeatMode, targetDate: string) {
  const anchor = parseDateParts(anchorDate);
  const target = parseDateParts(targetDate);
  if (!anchor || !target) return false;
  if (targetDate < anchorDate) return false;
  if (repeatMode === "one-time") return anchorDate === targetDate;
  if (repeatMode === "monthly") return anchor.day === target.day;
  return anchor.month === target.month && anchor.day === target.day;
}

export function countMemorableOccurrences(anchorDate: string, repeatMode: MemorableRepeatMode, targetDate: string) {
  if (!matchesMemorableDate(anchorDate, repeatMode, targetDate)) return null;
  const anchor = parseDateParts(anchorDate);
  const target = parseDateParts(targetDate);
  if (!anchor || !target) return null;
  if (repeatMode === "monthly") {
    return (target.year - anchor.year) * 12 + (target.month - anchor.month);
  }
  if (repeatMode === "yearly") {
    return target.year - anchor.year;
  }
  return 0;
}

export function buildOccurrenceLabel(title: string, repeatMode: MemorableRepeatMode, count: number | null) {
  if (repeatMode === "monthly" && count !== null) {
    return `${count} month${count === 1 ? "" : "s"} since ${title.toLowerCase()}`;
  }
  if (repeatMode === "yearly" && count !== null) {
    return `${count} year${count === 1 ? "" : "s"} since ${title.toLowerCase()}`;
  }
  return title;
}

export function toMemorableDayView(row: MemorableDayRecord, targetDate: string): MemorableDayView {
  const occurrenceCount = countMemorableOccurrences(row.date, row.repeatMode, targetDate);
  return {
    ...row,
    locked: false,
    source: "user",
    occurrenceCount,
    occurrenceLabel: buildOccurrenceLabel(row.title, row.repeatMode, occurrenceCount),
  };
}

export function deriveBirthdayMemorableDay(birthday: string, today: string): MemorableDayView | null {
  const parts = parseDateParts(birthday);
  if (!parts) return null;
  const row: MemorableDayRecord = {
    id: -1,
    date: birthday,
    title: "Birth",
    emoji: "🎂",
    description: "Birthday from Settings",
    repeatMode: "yearly",
    createdAt: birthday,
    updatedAt: birthday,
  };
  const view = toMemorableDayView(row, today);
  return {
    ...view,
    locked: true,
    source: "birthday",
  };
}
