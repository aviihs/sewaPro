import { Injectable } from '@nestjs/common';
import { type RequestContext } from '../../../common/auth/role.js';
import { AccountSuspendedError } from '../../../common/errors/auth.errors.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { InvalidRefreshTokenError, RefreshTokenReuseError } from '../domain/auth.errors.js';
import { RefreshTokenRepository, isRefreshTokenExpired } from '../domain/refresh-token.js';
import { AuthSecrets } from './auth.ports.js';
import { type AuthSession, SessionIssuer } from './session-issuer.js';

/**
 * Rotates a refresh token. Presenting an already-rotated token (theft or
 * replay) revokes the entire token family, logging out every device that
 * descends from that login.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly secrets: AuthSecrets,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(refreshToken: string, context: RequestContext): Promise<AuthSession> {
    const now = this.clock.now();
    const stored = await this.tokens.findByHash(this.secrets.hashRefreshToken(refreshToken));
    if (!stored) throw new InvalidRefreshTokenError();
    if (stored.revokedAt) {
      await this.tokens.revokeFamily(stored.familyId, now);
      throw new RefreshTokenReuseError();
    }
    if (isRefreshTokenExpired(stored, now)) throw new InvalidRefreshTokenError();

    const user = await this.users.findById(stored.userId);
    if (!user?.canLogin) {
      await this.tokens.revokeFamily(stored.familyId, now);
      throw user ? new AccountSuspendedError() : new InvalidRefreshTokenError();
    }

    try {
      return await this.uow.run(async () => {
        const next = await this.sessions.continue(user, stored.familyId, context);
        const claimed = await this.tokens.revokeIfActive(stored.id, now, next.refreshTokenId);
        if (!claimed) throw new RefreshTokenReuseError();
        return next;
      });
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        await this.tokens.revokeFamily(stored.familyId, now);
      }
      throw error;
    }
  }
}
