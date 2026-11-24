import { toNepalTime } from '../../../common/time/nepal-time.js';
import { AvailabilityOverlapError, InvalidAvailabilityWindowError } from './providers.errors.js';

/** A weekly working window in Nepal time; minutes since local midnight, end exclusive. */
export interface AvailabilityWindow {
  readonly dayOfWeek: number;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface BlockedDate {
  readonly id: string;
  readonly providerId: string;
  /** Nepal calendar date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly reason: string | null;
}

export interface ProviderSettings {
  readonly maxDailyBookings: number;
  readonly slotMinutes: number;
}

export const DEFAULT_SETTINGS: ProviderSettings = { maxDailyBookings: 5, slotMinutes: 60 };
export const MAX_WINDOWS_PER_WEEK = 21;
/** Dates can be blocked at most this far ahead, which also bounds the blocked-date list. */
export const BLOCKED_DATE_HORIZON_DAYS = 365;

/** Each window must end after it starts; windows on the same day must not overlap (touching is fine). */
export function assertValidSchedule(windows: readonly AvailabilityWindow[]): void {
  const invalid = windows.find((w) => w.endMinute <= w.startMinute);
  if (invalid) throw new InvalidAvailabilityWindowError(invalid.dayOfWeek);
  const sorted = [...windows].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
  );
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous.dayOfWeek === current.dayOfWeek && current.startMinute < previous.endMinute) {
      throw new AvailabilityOverlapError(current.dayOfWeek);
    }
  }
}

/**
 * True if `[start, start + durationMinutes)` lies inside one window on the
 * same Nepal day and that day is not blocked.
 */
export function fitsAvailability(
  windows: readonly AvailabilityWindow[],
  blockedDates: readonly string[],
  start: Date,
  durationMinutes: number,
): boolean {
  const local = toNepalTime(start);
  if (blockedDates.includes(local.date)) return false;
  const end = local.minuteOfDay + durationMinutes;
  return windows.some(
    (w) =>
      w.dayOfWeek === local.dayOfWeek && w.startMinute <= local.minuteOfDay && end <= w.endMinute,
  );
}
