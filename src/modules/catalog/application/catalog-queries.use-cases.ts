import { Injectable } from '@nestjs/common';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import { type Category, type Service } from '../domain/catalog.js';
import {
  type CatalogListFilter,
  CategoryRepository,
  type ServiceListFilter,
  ServiceRepository,
} from '../domain/catalog.repositories.js';
import { CategoryNotFoundError, ServiceNotFoundError } from '../domain/catalog.errors.js';

/** Admin: categories including inactive ones. */
@Injectable()
export class ListCategoriesUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  execute(filter: CatalogListFilter, page: PageRequest): Promise<PaginatedResult<Category>> {
    return this.categories.list(filter, page);
  }
}

@Injectable()
export class GetCategoryUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(id: string): Promise<Category> {
    const category = await this.categories.findById(id);
    if (!category) throw new CategoryNotFoundError();
    return category;
  }
}

/** Admin: services including inactive ones. */
@Injectable()
export class ListServicesUseCase {
  constructor(private readonly services: ServiceRepository) {}

  execute(filter: ServiceListFilter, page: PageRequest): Promise<PaginatedResult<Service>> {
    return this.services.list(filter, page);
  }
}

@Injectable()
export class GetServiceUseCase {
  constructor(private readonly services: ServiceRepository) {}

  async execute(id: string): Promise<Service> {
    const service = await this.services.findById(id);
    if (!service) throw new ServiceNotFoundError();
    return service;
  }
}
