import { type ActorRole } from '../../../common/auth/role.js';
import { DomainError } from '../../../common/errors/domain-error.js';
import { isCalendarDate } from '../../../common/time/nepal-time.js';

export type PeriodUnit = 'day' | 'month';

export const REPORT_LIMITS: Readonly<Record<PeriodUnit, number>> = { day: 366, month: 60 };

export interface DashboardTotals {
  readonly customers: number;
  readonly providers: number;
  readonly verifiedProviders: number;
  readonly pendingVerification: number;
  readonly suspendedUsers: number;
  readonly bookingsByStatus: Readonly<Record<string, number>>;
  readonly openDisputes: number;
}

export interface GrowthRow {
  readonly period: string;
  readonly newCustomers: number;
  readonly newProviders: number;
  readonly newBookings: number;
}

export interface BookingReportRow {
  readonly period: string;
  readonly created: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly completedAmount: number;
}

export interface ActivityItem {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly actorRole: ActorRole | null;
  readonly createdAt: Date;
}

export interface ReportRange {
  /** Inclusive Nepal date, YYYY-MM-DD. */
  readonly from: string;
  /** Inclusive Nepal date, YYYY-MM-DD. */
  readonly to: string;
  readonly unit: PeriodUnit;
}

/** Aggregates computed by the database; nothing here loads whole tables. */
export abstract class AdminStatsReader {
  abstract totals(): Promise<DashboardTotals>;
  abstract growth(range: ReportRange): Promise<GrowthRow[]>;
  abstract bookingReport(range: ReportRange): Promise<BookingReportRow[]>;
  abstract recentActivity(limit: number): Promise<ActivityItem[]>;
}

export class InvalidReportRangeError extends DomainError {
  readonly code = 'INVALID_REPORT_RANGE';
  readonly kind = 'VALIDATION';
  constructor(message: string) {
    super(message, { limits: REPORT_LIMITS });
  }
}

/** Period keys covering the range: `YYYY-MM-DD` for days, `YYYY-MM` for months. */
export function periodsBetween(range: ReportRange): string[] {
  if (!isCalendarDate(range.from) || !isCalendarDate(range.to)) {
    throw new InvalidReportRangeError('`from` and `to` must be real calendar dates');
  }
  if (range.from > range.to) throw new InvalidReportRangeError('`from` must not be after `to`');
  const keys: string[] = [];
  const cursor = new Date(`${range.from}T00:00:00.000Z`);
  if (range.unit === 'month') cursor.setUTCDate(1);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString();
    keys.push(range.unit === 'day' ? iso.slice(0, 10) : iso.slice(0, 7));
    if (range.unit === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    if (keys.length > REPORT_LIMITS[range.unit]) {
      throw new InvalidReportRangeError(
        `At most ${REPORT_LIMITS[range.unit]} ${range.unit}s per report`,
      );
    }
  }
  return keys;
}

/** One row per period, in order, with zeros where the database returned nothing. */
export function fillPeriods<T extends { period: string }>(
  periods: readonly string[],
  rows: readonly T[],
  empty: (period: string) => T,
): T[] {
  const byPeriod = new Map(rows.map((row) => [row.period, row]));
  return periods.map((period) => byPeriod.get(period) ?? empty(period));
}
