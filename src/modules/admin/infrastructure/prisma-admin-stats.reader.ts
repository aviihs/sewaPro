import { Injectable } from '@nestjs/common';
import { nepalDayRange } from '../../../common/time/nepal-time.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type ActivityItem,
  AdminStatsReader,
  type BookingReportRow,
  type DashboardTotals,
  type GrowthRow,
  type ReportRange,
} from '../domain/admin-stats.js';

const FORMAT = { day: 'YYYY-MM-DD', month: 'YYYY-MM' } as const;

function bounds(range: ReportRange): { start: Date; end: Date } {
  return { start: nepalDayRange(range.from).start, end: nepalDayRange(range.to).end };
}

/**
 * Dashboard and report aggregates. Periods are bucketed in Nepal time inside
 * PostgreSQL (`AT TIME ZONE 'Asia/Kathmandu'`); filters use the created_at indexes.
 */
@Injectable()
export class PrismaAdminStatsReader extends AdminStatsReader {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client;
  }

  async totals(): Promise<DashboardTotals> {
    const [users, providers, bookings, openDisputes] = await Promise.all([
      this.db.user.groupBy({
        by: ['role', 'status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.db.provider.groupBy({
        by: ['verificationStatus'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.db.booking.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.dispute.count({ where: { status: { not: 'RESOLVED' } } }),
    ]);
    const usersWhere = (match: (g: (typeof users)[number]) => boolean) =>
      users.filter(match).reduce((sum, g) => sum + g._count._all, 0);
    const providersIn = (status: string) =>
      providers.find((g) => g.verificationStatus === status)?._count._all ?? 0;
    return {
      customers: usersWhere((g) => g.role === 'CUSTOMER'),
      providers: usersWhere((g) => g.role === 'PROVIDER'),
      verifiedProviders: providersIn('VERIFIED'),
      pendingVerification: providersIn('PENDING_VERIFICATION'),
      suspendedUsers: usersWhere((g) => g.status === 'SUSPENDED'),
      bookingsByStatus: Object.fromEntries(bookings.map((g) => [g.status, g._count._all])),
      openDisputes,
    };
  }

  async growth(range: ReportRange): Promise<GrowthRow[]> {
    const { start, end } = bounds(range);
    const format = FORMAT[range.unit];
    const [users, bookings] = await Promise.all([
      this.db.$queryRaw<{ period: string; customers: number; providers: number }[]>`
        SELECT to_char(date_trunc(${range.unit}, created_at AT TIME ZONE 'Asia/Kathmandu'), ${format}) AS period,
               (count(*) FILTER (WHERE role = 'CUSTOMER'))::int AS customers,
               (count(*) FILTER (WHERE role = 'PROVIDER'))::int AS providers
        FROM users
        WHERE deleted_at IS NULL AND created_at >= ${start} AND created_at < ${end}
        GROUP BY 1`,
      this.db.$queryRaw<{ period: string; bookings: number }[]>`
        SELECT to_char(date_trunc(${range.unit}, created_at AT TIME ZONE 'Asia/Kathmandu'), ${format}) AS period,
               count(*)::int AS bookings
        FROM bookings
        WHERE created_at >= ${start} AND created_at < ${end}
        GROUP BY 1`,
    ]);
    const periods = new Set([...users.map((u) => u.period), ...bookings.map((b) => b.period)]);
    return [...periods].map((period) => {
      const u = users.find((row) => row.period === period);
      return {
        period,
        newCustomers: u?.customers ?? 0,
        newProviders: u?.providers ?? 0,
        newBookings: bookings.find((row) => row.period === period)?.bookings ?? 0,
      };
    });
  }

  bookingReport(range: ReportRange): Promise<BookingReportRow[]> {
    const { start, end } = bounds(range);
    return this.db.$queryRaw<BookingReportRow[]>`
      SELECT to_char(date_trunc(${range.unit}, created_at AT TIME ZONE 'Asia/Kathmandu'), ${FORMAT[range.unit]}) AS period,
             count(*)::int AS created,
             (count(*) FILTER (WHERE status = 'COMPLETED'))::int AS completed,
             (count(*) FILTER (WHERE status IN ('CANCELLED', 'REJECTED')))::int AS cancelled,
             COALESCE(sum(final_amount) FILTER (WHERE status = 'COMPLETED'), 0)::float8 AS "completedAmount"
      FROM bookings
      WHERE created_at >= ${start} AND created_at < ${end}
      GROUP BY 1
      ORDER BY 1`;
  }

  recentActivity(limit: number): Promise<ActivityItem[]> {
    return this.db.auditLog.findMany({
      select: { action: true, entityType: true, entityId: true, actorRole: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
}
