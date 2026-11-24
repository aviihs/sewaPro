import { Injectable } from '@nestjs/common';
import { PaginatedResult, type PageRequest, toOffset } from '../../../common/utils/pagination.js';
import {
  type Category as CategoryRow,
  type Prisma,
  type Service as ServiceRow,
} from '../../../infrastructure/prisma/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type ActiveCategory,
  type Category,
  type CategoryChanges,
  type NewCategory,
  type Service,
} from '../domain/catalog.js';
import { type CatalogListFilter, CategoryRepository } from '../domain/catalog.repositories.js';
import { CategoryNameTakenError, SlugTakenError } from '../domain/catalog.errors.js';

export const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  iconUrl: row.iconUrl,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toService = (row: ServiceRow): Service => ({
  id: row.id,
  categoryId: row.categoryId,
  name: row.name,
  slug: row.slug,
  description: row.description,
  isActive: row.isActive,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Maps a unique violation to the matching domain conflict. */
export function catalogConflict(error: unknown, slug: string | undefined, nameError: Error): Error {
  if (isUniqueViolation(error, 'slug')) return new SlugTakenError(slug ?? '');
  if (isUniqueViolation(error, 'name')) return nameError;
  return error instanceof Error ? error : new Error(String(error));
}

@Injectable()
export class PrismaCategoryRepository extends CategoryRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client;
  }

  async findById(id: string): Promise<Category | null> {
    const row = await this.db.category.findFirst({ where: { id, deletedAt: null } });
    return row ? toCategory(row) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await this.db.category.count({ where: { slug } })) > 0;
  }

  async nameTaken(name: string, excludeId?: string): Promise<boolean> {
    const where: Prisma.CategoryWhereInput = {
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };
    return (await this.db.category.count({ where })) > 0;
  }

  async create(category: NewCategory): Promise<Category> {
    try {
      return toCategory(await this.db.category.create({ data: category }));
    } catch (error) {
      throw catalogConflict(error, category.slug, new CategoryNameTakenError());
    }
  }

  async update(id: string, changes: CategoryChanges): Promise<Category> {
    try {
      return toCategory(await this.db.category.update({ where: { id }, data: changes }));
    } catch (error) {
      throw catalogConflict(error, changes.slug, new CategoryNameTakenError());
    }
  }

  async softDelete(id: string, at: Date): Promise<void> {
    await this.db.service.updateMany({
      where: { categoryId: id, deletedAt: null },
      data: { deletedAt: at, isActive: false },
    });
    await this.db.category.update({ where: { id }, data: { deletedAt: at, isActive: false } });
  }

  async hasActiveProviderLinks(id: string): Promise<boolean> {
    const count = await this.db.providerService.count({
      where: { isActive: true, service: { categoryId: id, deletedAt: null } },
    });
    return count > 0;
  }

  async list(filter: CatalogListFilter, page: PageRequest): Promise<PaginatedResult<Category>> {
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      isActive: filter.isActive,
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        ...toOffset(page),
      }),
      this.db.category.count({ where }),
    ]);
    return PaginatedResult.of(rows.map(toCategory), total, page);
  }

  async activeCatalog(): Promise<ActiveCategory[]> {
    const rows = await this.db.category.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        services: { where: { isActive: true, deletedAt: null }, orderBy: { name: 'asc' } },
      },
    });
    return rows.map(({ services, ...category }) => ({
      category: toCategory(category),
      services: services.map(toService),
    }));
  }
}
