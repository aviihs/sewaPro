import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type BookingCounts,
  type EarningsTotals,
  ProviderStatsReader,
} from '../domain/provider.repositories.js';

/** Aggregates computed in the database (GROUP BY / SUM), never by loading rows. */
@Injectable()
export class PrismaProviderStatsReader extends ProviderStatsReader {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  async bookingCounts(
    providerId: string,
    today: { start: Date; end: Date },
  ): Promise<BookingCounts> {
    const db = this.host.client.booking;
    const [groups, scheduledToday] = await Promise.all([
      db.groupBy({ by: ['status'], where: { providerId }, _count: { _all: true } }),
      db.count({
        where: {
          providerId,
          scheduledAt: { gte: today.start, lt: today.end },
          status: { notIn: ['CANCELLED', 'REJECTED'] },
        },
      }),
    ]);
    const count = (...statuses: string[]): number =>
      groups.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count._all, 0);
    return {
      pending: count('PENDING'),
      accepted: count('ACCEPTED'),
      inProgress: count('ON_THE_WAY', 'IN_PROGRESS'),
      completed: count('COMPLETED'),
      cancelled: count('CANCELLED', 'REJECTED'),
      disputed: count('DISPUTED'),
      scheduledToday,
    };
  }

  async completedTotals(
    providerId: string,
    range?: { start: Date; end: Date },
  ): Promise<EarningsTotals> {
    const result = await this.host.client.booking.aggregate({
      where: {
        providerId,
        status: 'COMPLETED',
        ...(range ? { completedAt: { gte: range.start, lt: range.end } } : {}),
      },
      _count: { _all: true },
      _sum: { finalAmount: true },
    });
    return {
      completedJobs: result._count._all,
      totalAmount: result._sum.finalAmount?.toNumber() ?? 0,
    };
  }
}
