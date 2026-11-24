import { type CacheKey, cacheKey } from '../ports/cache.port.js';

/** Account status cached by the auth guard; delete it when a user's status changes. */
export type CachedUserStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'MISSING';

export const USER_STATUS_CACHE_TTL_MS = 30_000;

export const userStatusCacheKey = (userId: string): CacheKey<CachedUserStatus> =>
  cacheKey<CachedUserStatus>(`auth:user-status:${userId}`);
