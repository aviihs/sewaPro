import { Injectable } from '@nestjs/common';
import { type Prisma } from '../../../infrastructure/prisma/generated/client.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import { type OfferingInput, type ProviderOffering } from '../domain/offering.js';
import { OfferingRepository } from '../domain/provider.repositories.js';

const include = {
  service: { select: { name: true, categoryId: true } },
} satisfies Prisma.ProviderServiceInclude;
type Row = Prisma.ProviderServiceGetPayload<{ include: typeof include }>;

const toOffering = (row: Row): ProviderOffering => ({
  id: row.id,
  providerId: row.providerId,
  serviceId: row.serviceId,
  serviceName: row.service.name,
  categoryId: row.service.categoryId,
  pricingType: row.pricingType,
  price: row.price === null ? null : row.price.toNumber(),
  description: row.description,
  isActive: row.isActive,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

@Injectable()
export class PrismaOfferingRepository extends OfferingRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client.providerService;
  }

  async listByProvider(providerId: string): Promise<ProviderOffering[]> {
    const rows = await this.db.findMany({
      where: { providerId },
      include,
      orderBy: { service: { name: 'asc' } },
    });
    return rows.map(toOffering);
  }

  async find(providerId: string, serviceId: string): Promise<ProviderOffering | null> {
    const row = await this.db.findUnique({
      where: { providerId_serviceId: { providerId, serviceId } },
      include,
    });
    return row ? toOffering(row) : null;
  }

  async upsert(
    providerId: string,
    serviceId: string,
    input: OfferingInput,
  ): Promise<ProviderOffering> {
    const row = await this.db.upsert({
      where: { providerId_serviceId: { providerId, serviceId } },
      create: { providerId, serviceId, ...input },
      update: input,
      include,
    });
    return toOffering(row);
  }

  async remove(providerId: string, serviceId: string): Promise<boolean> {
    const { count } = await this.db.deleteMany({ where: { providerId, serviceId } });
    return count > 0;
  }
}
