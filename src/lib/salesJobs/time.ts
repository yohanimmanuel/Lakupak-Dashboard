export const DEFAULT_JOB_TIMEZONE = 'Asia/Jakarta';

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateKey: string;
};

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '0';
  const year = read('year');
  const month = read('month');
  const day = read('day');
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(read('hour')),
    minute: Number(read('minute')),
    dateKey: `${year}-${month}-${day}`,
  };
}

/** UTC range covering the local calendar day `YYYY-MM-DD` in `timeZone`. */
export function zonedDayRange(dateKey: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const shown = zonedParts(utcMidnight, timeZone);
  const shownUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
  const intendedUtc = Date.UTC(year, month - 1, day, 0, 0);
  const start = new Date(utcMidnight.getTime() - (shownUtc - intendedUtc));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
