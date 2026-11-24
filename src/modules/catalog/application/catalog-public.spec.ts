import { beforeEach, describe, expect, it } from 'vitest';
import { aCategory, aService } from '../../../../test/unit/fixtures/catalog.js';
import { mockOf } from '../../../../test/unit/mock.js';
import { Cache } from '../../../common/ports/cache.port.js';
import { PaginatedResult } from '../../../common/utils/pagination.js';
import { CategoryRepository, ServiceRepository } from '../domain/catalog.repositories.js';
import {
  CategoryNotFoundError,
  ServiceNotFoundError,
  SlugTakenError,
} from '../domain/catalog.errors.js';
import {
  GetCategoryUseCase,
  GetServiceUseCase,
  ListCategoriesUseCase,
  ListServicesUseCase,
} from './catalog-queries.use-cases.js';
import { CatalogSnapshot, resolveSlug } from './catalog-snapshot.js';
import {
  ListActiveCategoriesUseCase,
  ListActiveServicesUseCase,
} from './public-catalog.use-cases.js';

const catalog = [
  { category: aCategory(), services: [aService(), aService({ id: 'svc-2', name: 'Wiring' })] },
  {
    category: aCategory({ id: 'cat-2', name: 'Plumber' }),
    services: [aService({ id: 'svc-3', categoryId: 'cat-2', name: 'Leak Repair' })],
  },
];

describe('CatalogSnapshot', () => {
  const categories = mockOf<CategoryRepository>();
  const cache = mockOf<Cache>();
  const snapshot = new CatalogSnapshot(categories, cache);

  it('loads from the repository on a miss and caches for 10 minutes', async () => {
    cache.get.mockResolvedValue(undefined);
    categories.activeCatalog.mockResolvedValue(catalog);
    await expect(snapshot.get()).resolves.toBe(catalog);
    expect(cache.set).toHaveBeenCalledWith({ name: 'catalog:active' }, catalog, 600_000);
  });

  it('serves hits from the cache and invalidates the single key', async () => {
    cache.get.mockResolvedValue(catalog);
    await snapshot.get();
    expect(categories.activeCatalog).not.toHaveBeenCalled();
    await snapshot.invalidate();
    expect(cache.delete).toHaveBeenCalledWith({ name: 'catalog:active' });
  });
});

describe('resolveSlug', () => {
  it('generates, accepts or rejects slugs', async () => {
    await expect(resolveSlug(undefined, 'AC Repair', () => Promise.resolve(false))).resolves.toBe(
      'ac-repair',
    );
    await expect(resolveSlug('custom', 'x', () => Promise.resolve(false))).resolves.toBe('custom');
    await expect(resolveSlug('custom', 'x', () => Promise.resolve(true))).rejects.toBeInstanceOf(
      SlugTakenError,
    );
  });
});

describe('public catalog use cases', () => {
  const snapshot = mockOf<CatalogSnapshot>();
  beforeEach(() => {
    snapshot.get.mockResolvedValue(catalog);
  });

  it('lists active categories', async () => {
    await expect(new ListActiveCategoriesUseCase(snapshot).execute()).resolves.toHaveLength(2);
  });

  it('lists services, filtered by category and name', async () => {
    const useCase = new ListActiveServicesUseCase(snapshot);
    expect(await useCase.execute({})).toHaveLength(3);
    expect((await useCase.execute({ categoryId: 'cat-2' })).map((s) => s.id)).toEqual(['svc-3']);
    expect((await useCase.execute({ search: 'WIR' })).map((s) => s.id)).toEqual(['svc-2']);
  });
});

describe('admin catalog queries', () => {
  const categories = mockOf<CategoryRepository>();
  const services = mockOf<ServiceRepository>();
  const page = { page: 1, limit: 20 };

  it('lists with filters', async () => {
    categories.list.mockResolvedValue(PaginatedResult.of([aCategory()], 1, page));
    services.list.mockResolvedValue(PaginatedResult.of([aService()], 1, page));
    expect(
      (await new ListCategoriesUseCase(categories).execute({ isActive: false }, page)).items,
    ).toHaveLength(1);
    expect(
      (await new ListServicesUseCase(services).execute({ categoryId: 'cat-1' }, page)).items,
    ).toHaveLength(1);
    expect(categories.list).toHaveBeenCalledWith({ isActive: false }, page);
  });

  it('gets by id or fails with not found', async () => {
    categories.findById.mockResolvedValueOnce(aCategory()).mockResolvedValueOnce(null);
    services.findById.mockResolvedValueOnce(aService()).mockResolvedValueOnce(null);
    await expect(new GetCategoryUseCase(categories).execute('cat-1')).resolves.toMatchObject({
      id: 'cat-1',
    });
    await expect(new GetCategoryUseCase(categories).execute('x')).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );
    await expect(new GetServiceUseCase(services).execute('svc-1')).resolves.toMatchObject({
      id: 'svc-1',
    });
    await expect(new GetServiceUseCase(services).execute('x')).rejects.toBeInstanceOf(
      ServiceNotFoundError,
    );
  });
});
