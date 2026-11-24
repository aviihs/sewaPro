import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/ports/clock.port.js';
import { RefreshTokenRepository } from '../domain/refresh-token.js';
import { AuthSecrets } from './auth.ports.js';

/**
 * Ends the session the refresh token belongs to (its whole family). Idempotent:
 * unknown or already-revoked tokens succeed silently, revealing nothing.
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly secrets: AuthSecrets,
    private readonly clock: Clock,
  ) {}

  async execute(refreshToken: string): Promise<void> {
    const stored = await this.tokens.findByHash(this.secrets.hashRefreshToken(refreshToken));
    if (stored) await this.tokens.revokeFamily(stored.familyId, this.clock.now());
  }
}
