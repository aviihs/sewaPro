export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  readonly page: number;
  readonly limit: number;
}

export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

/** Converts a 1-based page request into offset/limit for the data layer. */
export function toOffset(request: PageRequest): { readonly skip: number; readonly take: number } {
  return { skip: (request.page - 1) * request.limit, take: request.limit };
}

export function buildPaginationMeta(request: PageRequest, totalItems: number): PaginationMeta {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / request.limit);
  return {
    page: request.page,
    limit: request.limit,
    totalItems,
    totalPages,
    hasNextPage: request.page < totalPages,
    hasPreviousPage: request.page > 1 && totalPages > 0,
  };
}

/**
 * A page of results. Returned by use cases and controllers; the response
 * envelope interceptor unwraps it into `{ data: items, meta }`.
 */
export class PaginatedResult<T> {
  private constructor(
    readonly items: readonly T[],
    readonly meta: PaginationMeta,
  ) {}

  static of<T>(items: readonly T[], totalItems: number, request: PageRequest): PaginatedResult<T> {
    return new PaginatedResult(items, buildPaginationMeta(request, totalItems));
  }

  map<R>(mapper: (item: T) => R): PaginatedResult<R> {
    return new PaginatedResult(this.items.map(mapper), this.meta);
  }
}
