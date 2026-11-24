import { Injectable } from '@nestjs/common';
import { PaginatedResult, type PageRequest, toOffset } from '../../../common/utils/pagination.js';
import {
  type Prisma,
  type Provider as ProviderRow,
} from '../../../infrastructure/prisma/generated/client.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import { type ProviderSettings } from '../domain/availability.js';
import { type NewProvider, Provider, type ProviderProfileChanges } from '../domain/provider.js';
import {
  type ProviderAdminFilter,
  type ProviderAdminSummary,
  ProviderRepository,
} from '../domain/provider.repositories.js';

export function toProvider(row: ProviderRow): Provider {
  return Provider.restore({
    id: row.id,
    userId: row.userId,
    businessName: row.businessName,
    bio: row.bio,
    experienceYears: row.experienceYears,
    verificationStatus: row.verificationStatus,
    rejectionReason: row.rejectionReason,
    submittedAt: row.submittedAt,
    verifiedAt: row.verifiedAt,
    latitude: row.latitude,
    longitude: row.longitude,
    serviceRadiusKm: row.serviceRadiusKm,
    ratingAverage: row.ratingAverage.toNumber(),
    ratingCount: row.ratingCount,
    completedJobs: row.completedJobs,
    isAvailable: row.isAvailable,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

const adminInclude = {
  user: { select: { fullName: true, phone: true, email: true } },
  _count: { select: { documents: true } },
} satisfies Prisma.ProviderInclude;

type AdminRow = Prisma.ProviderGetPayload<{ include: typeof adminInclude }>;

const toAdminSummary = (row: AdminRow): ProviderAdminSummary => ({
  provider: toProvider(row),
  fullName: row.user.fullName,
  phone: row.user.phone,
  email: row.user.email,
  documentCount: row._count.documents,
});

@Injectable()
export class PrismaProviderRepository extends ProviderRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client.provider;
  }

  async findById(id: string): Promise<Provider | null> {
    const row = await this.db.findFirst({ where: { id, deletedAt: null } });
    return row ? toProvider(row) : null;
  }

  async findByUserId(userId: string): Promise<Provider | null> {
    const row = await this.db.findFirst({ where: { userId, deletedAt: null } });
    return row ? toProvider(row) : null;
  }

  async create(provider: NewProvider, settings: ProviderSettings): Promise<Provider> {
    return toProvider(
      await this.db.create({ data: { ...provider, settings: { create: settings } } }),
    );
  }

  async updateProfile(id: string, changes: ProviderProfileChanges): Promise<Provider> {
    return toProvider(await this.db.update({ where: { id }, data: changes }));
  }

  async saveVerification(provider: Provider): Promise<Provider> {
    const row = await this.db.update({
      where: { id: provider.id },
      data: {
        verificationStatus: provider.verificationStatus,
        rejectionReason: provider.rejectionReason,
        submittedAt: provider.submittedAt,
        verifiedAt: provider.verifiedAt,
      },
    });
    return toProvider(row);
  }

  async incrementCompletedJobs(id: string): Promise<void> {
    await this.db.update({ where: { id }, data: { completedJobs: { increment: 1 } } });
  }

  async setRating(id: string, average: number, count: number): Promise<void> {
    await this.db.update({ where: { id }, data: { ratingAverage: average, ratingCount: count } });
  }

  async listForAdmin(
    filter: ProviderAdminFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<ProviderAdminSummary>> {
    const search = filter.search;
    const where: Prisma.ProviderWhereInput = {
      deletedAt: null,
      verificationStatus: filter.status,
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, mode: 'insensitive' } },
              { user: { fullName: { contains: search, mode: 'insensitive' } } },
              { user: { phone: { contains: search } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.findMany({
        where,
        include: adminInclude,
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        ...toOffset(page),
      }),
      this.db.count({ where }),
    ]);
    return PaginatedResult.of(rows.map(toAdminSummary), total, page);
  }

  async findAdminSummary(id: string): Promise<ProviderAdminSummary | null> {
    const row = await this.db.findFirst({ where: { id, deletedAt: null }, include: adminInclude });
    return row ? toAdminSummary(row) : null;
  }
}
