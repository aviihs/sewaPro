import { Injectable } from '@nestjs/common';
import { type RequestContext } from '../../../common/auth/role.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { type User } from '../../users/domain/user.js';
import { RefreshTokenRepository } from '../domain/refresh-token.js';
import { AccessTokenService, AuthSecrets, AuthSettings } from './auth.ports.js';

const DAY_MS = 86_400_000;

export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly user: User;
}

/** Issues an access token and a rotating refresh token for a signed-in user. */
@Injectable()
export class SessionIssuer {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly secrets: AuthSecrets,
    private readonly settings: AuthSettings,
    private readonly clock: Clock,
  ) {}

  /** Starts a new session family (login, registration, OTP verification). */
  async start(user: User, context: RequestContext): Promise<AuthSession> {
    return this.issue(user, this.secrets.newId(), context);
  }

  /** Continues an existing family (refresh rotation). */
  async continue(
    user: User,
    familyId: string,
    context: RequestContext,
  ): Promise<AuthSession & { readonly refreshTokenId: string }> {
    return this.issue(user, familyId, context);
  }

  private async issue(user: User, familyId: string, context: RequestContext) {
    const refreshToken = this.secrets.newRefreshToken();
    const stored = await this.refreshTokens.create({
      userId: user.id,
      familyId,
      tokenHash: this.secrets.hashRefreshToken(refreshToken),
      expiresAt: new Date(this.clock.now().getTime() + this.settings.refreshTtlDays * DAY_MS),
      device: context.userAgent,
      ipAddress: context.ipAddress,
    });
    const accessToken = await this.accessTokens.sign({ id: user.id, role: user.role });
    return {
      accessToken,
      refreshToken,
      refreshTokenId: stored.id,
      expiresIn: this.settings.accessTtlSeconds,
      user,
    };
  }
}
