import { beforeEach, describe, expect, it } from 'vitest';
import { cacheKey } from '../../common/ports/cache.port.js';
import { InMemoryCache } from './in-memory.cache.js';

const objectKey = cacheKey<{ v: number }>('obj');
const numberKey = (name: string) => cacheKey<number>(name);

describe('InMemoryCache', () => {
  let now = 1_000;
  const clock = (): number => now;

  beforeEach(() => {
    now = 1_000;
  });

  it('stores and returns values until they expire', async () => {
    const cache = new InMemoryCache(clock);
    await cache.set(objectKey, { v: 1 }, 100);

    expect(await cache.get(objectKey)).toEqual({ v: 1 });
    now += 100;
    expect(await cache.get(objectKey)).toBeUndefined();
  });

  it('deletes entries', async () => {
    const cache = new InMemoryCache(clock);
    await cache.set(numberKey('k'), 1, 100);
    await cache.delete(numberKey('k'));
    expect(await cache.get(numberKey('k'))).toBeUndefined();
  });

  it('evicts the oldest entry when full', async () => {
    const cache = new InMemoryCache(clock, 2);
    await cache.set(numberKey('a'), 1, 100);
    await cache.set(numberKey('b'), 2, 100);
    await cache.set(numberKey('a'), 3, 100);
    await cache.set(numberKey('c'), 4, 100);

    expect(await cache.get(numberKey('b'))).toBeUndefined();
    expect(await cache.get(numberKey('a'))).toBe(3);
    expect(await cache.get(numberKey('c'))).toBe(4);
  });

  it('rejects non-positive TTLs', () => {
    expect(() => new InMemoryCache(clock).set(numberKey('k'), 1, 0)).toThrow(RangeError);
  });
});
