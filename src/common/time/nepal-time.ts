/** Nepal Standard Time is UTC+05:45 all year (no daylight saving). */
export const NEPAL_UTC_OFFSET_MINUTES = 345;
const OFFSET_MS = NEPAL_UTC_OFFSET_MINUTES * 60_000;
const DAY_MS = 86_400_000;

export interface NepalDateTime {
  /** 0 = Sunday … 6 = Saturday, in Nepal time. */
  readonly dayOfWeek: number;
  /** Minutes since local midnight. */
  readonly minuteOfDay: number;
  /** Local calendar date, `YYYY-MM-DD`. */
  readonly date: string;
}

export function toNepalTime(instant: Date): NepalDateTime {
  const local = new Date(instant.getTime() + OFFSET_MS);
  return {
    dayOfWeek: local.getUTCDay(),
    minuteOfDay: local.getUTCHours() * 60 + local.getUTCMinutes(),
    date: local.toISOString().slice(0, 10),
  };
}

/** UTC instants bounding a Nepal calendar day: `[start, end)`. */
export function nepalDayRange(date: string): { readonly start: Date; readonly end: Date } {
  const start = new Date(Date.parse(`${date}T00:00:00.000Z`) - OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** UTC instants bounding the Nepal calendar month containing `instant`. */
export function nepalMonthRange(instant: Date): { readonly start: Date; readonly end: Date } {
  const local = new Date(instant.getTime() + OFFSET_MS);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  const endLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1);
  return { start: new Date(startLocal - OFFSET_MS), end: new Date(endLocal - OFFSET_MS) };
}

/** `YYYY-MM-DD` that is a real calendar date. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
