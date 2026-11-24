/**
 * Typed cache key: the value type travels with the key, so callers get the
 * right type back without casts. Create keys with `cacheKey<T>(name)`.
 */
export interface CacheKey<T> {
  readonly name: string;
  readonly __valueType?: T;
}

export function cacheKey<T>(name: string): CacheKey<T> {
  return { name };
}

/** Key/value cache with per-entry TTL. Implementations: in-memory now, Redis later. */
export abstract class Cache {
  abstract get<T>(key: CacheKey<T>): Promise<T | undefined>;
  abstract set<T>(key: CacheKey<T>, value: T, ttlMs: number): Promise<void>;
  abstract delete(key: CacheKey<unknown>): Promise<void>;
}
