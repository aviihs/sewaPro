import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/ports/clock.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { isCalendarDate, toNepalTime } from '../../../common/time/nepal-time.js';
import {
  type AvailabilityWindow,
  BLOCKED_DATE_HORIZON_DAYS,
  type BlockedDate,
  type ProviderSettings,
  assertValidSchedule,
} from '../domain/availability.js';
import { AvailabilityRepository, ProviderRepository } from '../domain/provider.repositories.js';
import {
  BlockedDateInPastError,
  BlockedDateNotFoundError,
  InvalidCalendarDateError,
} from '../domain/providers.errors.js';
import { requireOwnProvider } from './provider-access.js';

export interface AvailabilityView {
  readonly windows: AvailabilityWindow[];
  readonly blockedDates: BlockedDate[];
  readonly settings: ProviderSettings;
}

@Injectable()
export class GetMyAvailabilityUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly availability: AvailabilityRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<AvailabilityView> {
    const { id } = await requireOwnProvider(this.providers, userId);
    const today = toNepalTime(this.clock.now()).date;
    const [windows, blockedDates, settings] = await Promise.all([
      this.availability.getWindows(id),
      this.availability.listBlockedDates(id, today),
      this.availability.getSettings(id),
    ]);
    return { windows, blockedDates, settings };
  }
}

/** Replaces the whole weekly schedule (PUT semantics). */
@Injectable()
export class ReplaceAvailabilityWindowsUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly availability: AvailabilityRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(
    userId: string,
    windows: readonly AvailabilityWindow[],
  ): Promise<AvailabilityWindow[]> {
    const { id } = await requireOwnProvider(this.providers, userId);
    assertValidSchedule(windows);
    return this.uow.run(async () => {
      await this.availability.replaceWindows(id, windows);
      return this.availability.getWindows(id);
    });
  }
}

@Injectable()
export class AddBlockedDateUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly availability: AvailabilityRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, date: string, reason: string | null): Promise<BlockedDate> {
    const { id } = await requireOwnProvider(this.providers, userId);
    if (!isCalendarDate(date)) throw new InvalidCalendarDateError(date);
    const now = this.clock.now();
    const horizon = toNepalTime(
      new Date(now.getTime() + BLOCKED_DATE_HORIZON_DAYS * 86_400_000),
    ).date;
    if (date < toNepalTime(now).date || date > horizon) {
      throw new BlockedDateInPastError(BLOCKED_DATE_HORIZON_DAYS);
    }
    return this.availability.addBlockedDate(id, date, reason);
  }
}

@Injectable()
export class RemoveBlockedDateUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly availability: AvailabilityRepository,
  ) {}

  async execute(userId: string, blockedDateId: string): Promise<void> {
    const { id } = await requireOwnProvider(this.providers, userId);
    if (!(await this.availability.removeBlockedDate(blockedDateId, id))) {
      throw new BlockedDateNotFoundError();
    }
  }
}

@Injectable()
export class UpdateProviderSettingsUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly availability: AvailabilityRepository,
  ) {}

  async execute(userId: string, changes: Partial<ProviderSettings>): Promise<ProviderSettings> {
    const { id } = await requireOwnProvider(this.providers, userId);
    return this.availability.updateSettings(id, changes);
  }
}
