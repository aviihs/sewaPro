import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type AvailabilityWindow,
  type BlockedDate,
  DEFAULT_SETTINGS,
  type ProviderSettings,
} from '../domain/availability.js';
import { AvailabilityRepository } from '../domain/provider.repositories.js';
import { BlockedDateConflictError } from '../domain/providers.errors.js';

/** `@db.Date` columns come back as UTC midnight; the domain uses `YYYY-MM-DD`. */
const toDateColumn = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const fromDateColumn = (date: Date): string => date.toISOString().slice(0, 10);

const windowSelect = { dayOfWeek: true, startMinute: true, endMinute: true } as const;

@Injectable()
export class PrismaAvailabilityRepository extends AvailabilityRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client;
  }

  getWindows(providerId: string): Promise<AvailabilityWindow[]> {
    return this.db.availabilityRule.findMany({
      where: { providerId },
      select: windowSelect,
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
  }

  /** Call inside a unit of work: delete + insert must be atomic. */
  async replaceWindows(providerId: string, windows: readonly AvailabilityWindow[]): Promise<void> {
    await this.db.availabilityRule.deleteMany({ where: { providerId } });
    await this.db.availabilityRule.createMany({ data: windows.map((w) => ({ ...w, providerId })) });
  }

  async listBlockedDates(providerId: string, fromDate: string): Promise<BlockedDate[]> {
    const rows = await this.db.blockedDate.findMany({
      where: { providerId, date: { gte: toDateColumn(fromDate) } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      date: fromDateColumn(r.date),
      reason: r.reason,
    }));
  }

  async addBlockedDate(
    providerId: string,
    date: string,
    reason: string | null,
  ): Promise<BlockedDate> {
    try {
      const row = await this.db.blockedDate.create({
        data: { providerId, date: toDateColumn(date), reason },
      });
      return { id: row.id, providerId, date, reason: row.reason };
    } catch (error) {
      if (isUniqueViolation(error)) throw new BlockedDateConflictError();
      throw error;
    }
  }

  async removeBlockedDate(id: string, providerId: string): Promise<boolean> {
    const { count } = await this.db.blockedDate.deleteMany({ where: { id, providerId } });
    return count > 0;
  }

  async getSettings(providerId: string): Promise<ProviderSettings> {
    const row = await this.db.providerSettings.findUnique({ where: { providerId } });
    return row
      ? { maxDailyBookings: row.maxDailyBookings, slotMinutes: row.slotMinutes }
      : DEFAULT_SETTINGS;
  }

  async updateSettings(
    providerId: string,
    changes: Partial<ProviderSettings>,
  ): Promise<ProviderSettings> {
    const row = await this.db.providerSettings.upsert({
      where: { providerId },
      create: { providerId, ...DEFAULT_SETTINGS, ...changes },
      update: changes,
    });
    return { maxDailyBookings: row.maxDailyBookings, slotMinutes: row.slotMinutes };
  }
}
