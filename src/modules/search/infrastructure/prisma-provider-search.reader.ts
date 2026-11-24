import { Injectable } from '@nestjs/common';
import { type Prisma } from '../../../infrastructure/prisma/generated/client.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type ProviderSearchFilter,
  type ProviderSearchHit,
  type ProviderSearchPage,
  ProviderSearchReader,
  type PublicOffering,
  type PublicProviderProfile,
} from '../domain/search.js';
import { searchCountSql, searchPageSql } from './provider-search.sql.js';

interface HitRow {
  readonly id: string;
  readonly display_name: string;
  readonly rating_average: number;
  readonly rating_count: number;
  readonly experience_years: number;
  readonly completed_jobs: number;
  readonly min_price: number | null;
  readonly distance_m: number | null;
  readonly services: PublicOffering[];
}

/** Kilometres with two decimals (10 m), enough for a listing. */
const toKm = (metres: number | null): number | null =>
  metres === null ? null : Math.round(metres / 10) / 100;

const toHit = (row: HitRow): ProviderSearchHit => ({
  providerId: row.id,
  displayName: row.display_name,
  ratingAverage: row.rating_average,
  ratingCount: row.rating_count,
  experienceYears: row.experience_years,
  completedJobs: row.completed_jobs,
  minPrice: row.min_price,
  distanceKm: toKm(row.distance_m),
  services: row.services,
});

const liveOffering = {
  isActive: true,
  service: { isActive: true, deletedAt: null, category: { isActive: true, deletedAt: null } },
} satisfies Prisma.ProviderServiceWhereInput;

const publicSelect = {
  id: true,
  businessName: true,
  bio: true,
  experienceYears: true,
  ratingAverage: true,
  ratingCount: true,
  completedJobs: true,
  serviceRadiusKm: true,
  isAvailable: true,
  verifiedAt: true,
  createdAt: true,
  user: { select: { fullName: true } },
  services: {
    where: liveOffering,
    select: {
      pricingType: true,
      price: true,
      service: { select: { id: true, name: true, category: { select: { id: true, name: true } } } },
    },
    orderBy: { service: { name: 'asc' } },
  },
  portfolioImages: {
    select: { id: true, storageKey: true, caption: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  availabilityRules: {
    select: { dayOfWeek: true, startMinute: true, endMinute: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
  },
} satisfies Prisma.ProviderSelect;

type PublicRow = Prisma.ProviderGetPayload<{ select: typeof publicSelect }>;

const toProfile = (row: PublicRow): PublicProviderProfile => ({
  id: row.id,
  displayName: row.businessName ?? row.user.fullName,
  bio: row.bio,
  experienceYears: row.experienceYears,
  ratingAverage: row.ratingAverage.toNumber(),
  ratingCount: row.ratingCount,
  completedJobs: row.completedJobs,
  serviceRadiusKm: row.serviceRadiusKm,
  isAvailable: row.isAvailable,
  verifiedAt: row.verifiedAt,
  memberSince: row.createdAt,
  services: row.services.map((offering) => ({
    serviceId: offering.service.id,
    serviceName: offering.service.name,
    categoryId: offering.service.category.id,
    categoryName: offering.service.category.name,
    pricingType: offering.pricingType,
    price: offering.price === null ? null : offering.price.toNumber(),
  })),
  portfolio: row.portfolioImages,
  weeklyHours: row.availabilityRules,
});

@Injectable()
export class PrismaProviderSearchReader extends ProviderSearchReader {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client;
  }

  async search(filter: ProviderSearchFilter): Promise<ProviderSearchPage> {
    const [rows, counts] = await Promise.all([
      this.db.$queryRaw<HitRow[]>(searchPageSql(filter)),
      this.db.$queryRaw<{ total: number }[]>(searchCountSql(filter)),
    ]);
    return { items: rows.map(toHit), totalItems: counts[0]?.total ?? 0 };
  }

  async findPublic(providerId: string): Promise<PublicProviderProfile | null> {
    const row = await this.db.provider.findFirst({
      where: {
        id: providerId,
        verificationStatus: 'VERIFIED',
        deletedAt: null,
        user: { status: { not: 'SUSPENDED' }, deletedAt: null },
      },
      select: publicSelect,
    });
    return row ? toProfile(row) : null;
  }
}
