import { describe, it, expect } from 'vitest';
import { PaginatedResult, buildPaginationMeta, toOffset } from './pagination.js';

describe('pagination', () => {
  it('converts a page request to skip/take', () => {
    expect(toOffset({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
    expect(toOffset({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('builds meta for a middle page', () => {
    expect(buildPaginationMeta({ page: 2, limit: 10 }, 35)).toEqual({
      page: 2,
      limit: 10,
      totalItems: 35,
      totalPages: 4,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('builds meta for an empty result', () => {
    expect(buildPaginationMeta({ page: 1, limit: 10 }, 0)).toMatchObject({
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('reports no next page on the last page', () => {
    expect(buildPaginationMeta({ page: 4, limit: 10 }, 35).hasNextPage).toBe(false);
  });

  it('maps items while keeping meta', () => {
    const page = PaginatedResult.of([1, 2], 2, { page: 1, limit: 10 });
    const mapped = page.map((n) => `#${n}`);
    expect(mapped.items).toEqual(['#1', '#2']);
    expect(mapped.meta).toBe(page.meta);
  });
});
