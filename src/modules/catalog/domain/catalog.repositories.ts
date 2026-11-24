import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import {
  type ActiveCategory,
  type Category,
  type CategoryChanges,
  type NewCategory,
  type NewService,
  type Service,
  type ServiceChanges,
} from './catalog.js';

export interface CatalogListFilter {
  readonly isActive?: boolean;
  /** Case-insensitive name match. */
  readonly search?: string;
}

export interface ServiceListFilter extends CatalogListFilter {
  readonly categoryId?: string;
}

/** Soft-deleted rows are invisible to every method except `slugExists`. */
export abstract class CategoryRepository {
  abstract findById(id: string): Promise<Category | null>;
  /** Includes soft-deleted rows: slugs are never reused. */
  abstract slugExists(slug: string): Promise<boolean>;
  abstract nameTaken(name: string, excludeId?: string): Promise<boolean>;
  /** @throws CategoryNameTakenError / SlugTakenError on a concurrent duplicate. */
  abstract create(category: NewCategory): Promise<Category>;
  abstract update(id: string, changes: CategoryChanges): Promise<Category>;
  /** Soft-deletes the category and all its services. */
  abstract softDelete(id: string, at: Date): Promise<void>;
  /** True if any provider actively offers any service of this category. */
  abstract hasActiveProviderLinks(id: string): Promise<boolean>;
  abstract list(filter: CatalogListFilter, page: PageRequest): Promise<PaginatedResult<Category>>;
  /** Active categories with their active services, sorted for display. */
  abstract activeCatalog(): Promise<ActiveCategory[]>;
}

export abstract class ServiceRepository {
  abstract findById(id: string): Promise<Service | null>;
  abstract slugExists(slug: string): Promise<boolean>;
  abstract nameTaken(categoryId: string, name: string, excludeId?: string): Promise<boolean>;
  abstract create(service: NewService): Promise<Service>;
  abstract update(id: string, changes: ServiceChanges): Promise<Service>;
  abstract softDelete(id: string, at: Date): Promise<void>;
  abstract hasActiveProviderLinks(id: string): Promise<boolean>;
  abstract list(filter: ServiceListFilter, page: PageRequest): Promise<PaginatedResult<Service>>;
}
