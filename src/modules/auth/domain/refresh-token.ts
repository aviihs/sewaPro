/**
 * A stored refresh token (only its hash is persisted). Tokens rotate on every
 * use; all tokens descending from one login share a `familyId`, so reuse of a
 * rotated token can revoke the whole family.
 */
export interface RefreshToken {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface NewRefreshToken {
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly device: string | null;
  readonly ipAddress: string | null;
}

export const isRefreshTokenExpired = (token: RefreshToken, now: Date): boolean =>
  token.expiresAt.getTime() <= now.getTime();

export abstract class RefreshTokenRepository {
  abstract findByHash(tokenHash: string): Promise<RefreshToken | null>;
  abstract create(token: NewRefreshToken): Promise<RefreshToken>;
  /**
   * Atomically revokes the token if it is still active, linking its successor.
   * Returns false when it was already revoked (concurrent use or replay).
   */
  abstract revokeIfActive(id: string, at: Date, replacedById: string | null): Promise<boolean>;
  abstract revokeFamily(familyId: string, at: Date): Promise<void>;
  abstract revokeAllForUser(userId: string, at: Date): Promise<void>;
}
