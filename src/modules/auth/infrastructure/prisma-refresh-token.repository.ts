import { Injectable } from '@nestjs/common';
import { type RefreshToken as RefreshTokenRow } from '../../../infrastructure/prisma/generated/client.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type NewRefreshToken,
  type RefreshToken,
  RefreshTokenRepository,
} from '../domain/refresh-token.js';

const toRefreshToken = (row: RefreshTokenRow): RefreshToken => ({
  id: row.id,
  userId: row.userId,
  familyId: row.familyId,
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt,
});

@Injectable()
export class PrismaRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.host.client.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toRefreshToken(row) : null;
  }

  async create(token: NewRefreshToken): Promise<RefreshToken> {
    return toRefreshToken(await this.host.client.refreshToken.create({ data: token }));
  }

  async revokeIfActive(id: string, at: Date, replacedById: string | null): Promise<boolean> {
    const { count } = await this.host.client.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at, replacedById },
    });
    return count === 1;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.host.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    await this.host.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}
