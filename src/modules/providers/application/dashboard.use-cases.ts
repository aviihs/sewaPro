import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/ports/clock.port.js';
import { nepalDayRange, nepalMonthRange, toNepalTime } from '../../../common/time/nepal-time.js';
import { type Provider } from '../domain/provider.js';
import {
  type BookingCounts,
  type EarningsTotals,
  ProviderRepository,
  ProviderStatsReader,
} from '../domain/provider.repositories.js';
import { requireOwnProvider } from './provider-access.js';

export interface ProviderDashboard {
  readonly provider: Provider;
  readonly bookings: BookingCounts;
}

@Injectable()
export class GetProviderDashboardUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly stats: ProviderStatsReader,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<ProviderDashboard> {
    const provider = await requireOwnProvider(this.providers, userId);
    const today = nepalDayRange(toNepalTime(this.clock.now()).date);
    return { provider, bookings: await this.stats.bookingCounts(provider.id, today) };
  }
}

export interface EarningsSummary {
  readonly allTime: EarningsTotals;
  readonly thisMonth: EarningsTotals;
}

/** Completed-job counts and totals of final amounts. No commission or payouts. */
@Injectable()
export class GetEarningsSummaryUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly stats: ProviderStatsReader,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<EarningsSummary> {
    const { id } = await requireOwnProvider(this.providers, userId);
    const [allTime, thisMonth] = await Promise.all([
      this.stats.completedTotals(id),
      this.stats.completedTotals(id, nepalMonthRange(this.clock.now())),
    ]);
    return { allTime, thisMonth };
  }
}
