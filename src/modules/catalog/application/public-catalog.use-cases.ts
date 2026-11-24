import { Injectable } from '@nestjs/common';
import { type ActiveCategory, type Service } from '../domain/catalog.js';
import { CatalogSnapshot } from './catalog-snapshot.js';

/** Public: active categories with their active services (served from the cache). */
@Injectable()
export class ListActiveCategoriesUseCase {
  constructor(private readonly snapshot: CatalogSnapshot) {}

  execute(): Promise<ActiveCategory[]> {
    return this.snapshot.get();
  }
}

export interface ActiveServiceFilter {
  readonly categoryId?: string;
  readonly search?: string;
}

/** Public: flat list of active services, optionally by category or name. */
@Injectable()
export class ListActiveServicesUseCase {
  constructor(private readonly snapshot: CatalogSnapshot) {}

  async execute(filter: ActiveServiceFilter): Promise<Service[]> {
    const needle = filter.search?.toLowerCase();
    return (await this.snapshot.get())
      .filter(({ category }) => !filter.categoryId || category.id === filter.categoryId)
      .flatMap(({ services }) => services)
      .filter((service) => !needle || service.name.toLowerCase().includes(needle));
  }
}
