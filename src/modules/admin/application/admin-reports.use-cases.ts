import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/ports/clock.port.js';
import { toNepalTime } from '../../../common/time/nepal-time.js';
import {
  type ActivityItem,
  AdminStatsReader,
  type BookingReportRow,
  type DashboardTotals,
  type GrowthRow,
  type ReportRange,
  fillPeriods,
  periodsBetween,
} from '../domain/admin-stats.js';

const GROWTH_MONTHS = 6;
const RECENT_ACTIVITY = 10;

export interface AdminDashboard {
  readonly totals: DashboardTotals;
  /** The current and previous five Nepal calendar months. */
  readonly monthlyGrowth: GrowthRow[];
  readonly recentActivity: ActivityItem[];
}

const emptyGrowth = (period: string): GrowthRow => ({
  period,
  newCustomers: 0,
  newProviders: 0,
  newBookings: 0,
});
const emptyBookings = (period: string): BookingReportRow => ({
  period,
  created: 0,
  completed: 0,
  cancelled: 0,
  completedAmount: 0,
});

@Injectable()
export class GetAdminDashboardUseCase {
  constructor(
    private readonly stats: AdminStatsReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<AdminDashboard> {
    const today = toNepalTime(this.clock.now()).date;
    const start = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
    start.setUTCMonth(start.getUTCMonth() - (GROWTH_MONTHS - 1));
    const range: ReportRange = { from: start.toISOString().slice(0, 10), to: today, unit: 'month' };
    const [totals, growth, recentActivity] = await Promise.all([
      this.stats.totals(),
      this.stats.growth(range),
      this.stats.recentActivity(RECENT_ACTIVITY),
    ]);
    return {
      totals,
      monthlyGrowth: fillPeriods(periodsBetween(range), growth, emptyGrowth),
      recentActivity,
    };
  }
}

/** Bookings created per day/month in a Nepal-date range, with outcomes and completed totals. */
@Injectable()
export class GetBookingReportUseCase {
  constructor(private readonly stats: AdminStatsReader) {}

  async execute(range: ReportRange): Promise<BookingReportRow[]> {
    const periods = periodsBetween(range);
    return fillPeriods(periods, await this.stats.bookingReport(range), emptyBookings);
  }
}

/** New customers, providers and bookings per day/month in a Nepal-date range. */
@Injectable()
export class GetGrowthReportUseCase {
  constructor(private readonly stats: AdminStatsReader) {}

  async execute(range: ReportRange): Promise<GrowthRow[]> {
    const periods = periodsBetween(range);
    return fillPeriods(periods, await this.stats.growth(range), emptyGrowth);
  }
}
