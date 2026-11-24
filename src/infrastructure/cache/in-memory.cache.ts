import { Cache, type CacheKey } from '../../common/ports/cache.port.js';

interface Entry {
  readonly value: unknown;
  readonly expiresAt: number;
}

export const IN_MEMORY_CACHE_MAX_ENTRIES = 10_000;

/**
 * Single-process cache. Expired entries are dropped lazily on read; when full,
 * the oldest inserted entry is evicted (Map preserves insertion order).
 * Constructed by CacheModule's factory (not by DI) so the clock is injectable in tests.
 */
export class InMemoryCache extends Cache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries: number = IN_MEMORY_CACHE_MAX_ENTRIES,
  ) {
    super();
  }

  get<T>(key: CacheKey<T>): Promise<T | undefined> {
    const entry = this.entries.get(key.name);
    if (!entry) return Promise.resolve(undefined);
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key.name);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value as T);
  }

  set<T>(key: CacheKey<T>, value: T, ttlMs: number): Promise<void> {
    if (ttlMs <= 0) throw new RangeError('ttlMs must be positive');
    this.entries.delete(key.name);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) this.entries.delete(oldest.value);
    }
    this.entries.set(key.name, { value, expiresAt: this.now() + ttlMs });
    return Promise.resolve();
  }

  delete(key: CacheKey<unknown>): Promise<void> {
    this.entries.delete(key.name);
    return Promise.resolve();
  }
}
