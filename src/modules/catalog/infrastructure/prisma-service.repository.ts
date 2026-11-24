import { Injectable } from '@nestjs/common';
import { PaginatedResult, type PageRequest, toOffset } from '../../../common/utils/pagination.js';
import { type Prisma } from '../../../infrastructure/prisma/generated/client.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import { type NewService, type Service, type ServiceChanges } from '../domain/catalog.js';
import { type ServiceListFilter, ServiceRepository } from '../domain/catalog.repositories.js';
import { ServiceNameTakenError } from '../domain/catalog.errors.js';
import { catalogConflict, toService } from './prisma-category.repository.js';

@Injectable()
export class PrismaServiceRepository extends ServiceRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client;
  }

  async findById(id: string): Promise<Service | null> {
    const row = await this.db.service.findFirst({ where: { id, deletedAt: null } });
    return row ? toService(row) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await this.db.service.count({ where: { slug } })) > 0;
  }

  async nameTaken(categoryId: string, name: string, excludeId?: string): Promise<boolean> {
    const where: Prisma.ServiceWhereInput = {
      categoryId,
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };
    return (await this.db.service.count({ where })) > 0;
  }

  async create(service: NewService): Promise<Service> {
    try {
      return toService(await this.db.service.create({ data: service }));
    } catch (error) {
      throw catalogConflict(error, service.slug, new ServiceNameTakenError());
    }
  }

  async update(id: string, changes: ServiceChanges): Promise<Service> {
    try {
      return toService(await this.db.service.update({ where: { id }, data: changes }));
    } catch (error) {
      throw catalogConflict(error, changes.slug, new ServiceNameTakenError());
    }
  }

  async softDelete(id: string, at: Date): Promise<void> {
    await this.db.service.update({ where: { id }, data: { deletedAt: at, isActive: false } });
  }

  async hasActiveProviderLinks(id: string): Promise<boolean> {
    return (await this.db.providerService.count({ where: { serviceId: id, isActive: true } })) > 0;
  }

  async list(filter: ServiceListFilter, page: PageRequest): Promise<PaginatedResult<Service>> {
    const where: Prisma.ServiceWhereInput = {
      deletedAt: null,
      isActive: filter.isActive,
      categoryId: filter.categoryId,
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.service.findMany({ where, orderBy: { name: 'asc' }, ...toOffset(page) }),
      this.db.service.count({ where }),
    ]);
    return PaginatedResult.of(rows.map(toService), total, page);
  }
}
