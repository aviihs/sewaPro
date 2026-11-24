import { Injectable } from '@nestjs/common';
import { Cache, cacheKey } from '../../../common/ports/cache.port.js';
import { uniqueSlug } from '../../../common/utils/slugify.js';
import { type ActiveCategory } from '../domain/catalog.js';
import { CategoryRepository } from '../domain/catalog.repositories.js';
import { SlugTakenError } from '../domain/catalog.errors.js';

const ACTIVE_CATALOG = cacheKey<ActiveCategory[]>('catalog:active');
const TTL_MS = 10 * 60_000;

/**
 * The whole active catalog is small and read on every app start, so it is
 * cached as one snapshot. Any admin write invalidates the single key.
 */
@Injectable()
export class CatalogSnapshot {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly cache: Cache,
  ) {}

  async get(): Promise<ActiveCategory[]> {
    const cached = await this.cache.get(ACTIVE_CATALOG);
    if (cached) return cached;
    const fresh = await this.categories.activeCatalog();
    await this.cache.set(ACTIVE_CATALOG, fresh, TTL_MS);
    return fresh;
  }

  invalidate(): Promise<void> {
    return this.cache.delete(ACTIVE_CATALOG);
  }
}

/** Uses the requested slug if free, otherwise derives a unique one from the name. */
export async function resolveSlug(
  requested: string | undefined,
  name: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (requested === undefined) return uniqueSlug(name, exists);
  if (await exists(requested)) throw new SlugTakenError(requested);
  return requested;
}
