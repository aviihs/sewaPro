import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser } from '../../../common/auth/role.js';
import {
  type CachedUserStatus,
  USER_STATUS_CACHE_TTL_MS,
  userStatusCacheKey,
} from '../../../common/auth/user-status-cache.js';
import {
  AccountSuspendedError,
  InvalidAccessTokenError,
} from '../../../common/errors/auth.errors.js';
import { Cache } from '../../../common/ports/cache.port.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { AccessTokenService } from './auth.ports.js';

/**
 * Validates an access token and re-checks the account status (cached for 30s),
 * so a suspension takes effect without waiting for the token to expire.
 */
@Injectable()
export class AuthenticateAccessTokenUseCase {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly users: UserRepository,
    private readonly cache: Cache,
  ) {}

  async execute(token: string): Promise<AuthenticatedUser> {
    const subject = await this.accessTokens.verify(token);
    if (!subject) throw new InvalidAccessTokenError();

    const status = await this.statusOf(subject.id);
    if (status === 'MISSING') throw new InvalidAccessTokenError();
    if (status === 'SUSPENDED') throw new AccountSuspendedError();
    return subject;
  }

  private async statusOf(userId: string): Promise<CachedUserStatus> {
    const key = userStatusCacheKey(userId);
    const cached = await this.cache.get(key);
    if (cached !== undefined) return cached;
    const user = await this.users.findById(userId);
    const status: CachedUserStatus = user ? user.status : 'MISSING';
    await this.cache.set(key, status, USER_STATUS_CACHE_TTL_MS);
    return status;
  }
}
