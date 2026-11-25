import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type NewOtpChallenge,
  type OtpChallenge,
  OtpChallengeRepository,
  type OtpPurpose,
} from '../domain/otp.js';

@Injectable()
export class PrismaOtpChallengeRepository extends OtpChallengeRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  async create(challenge: NewOtpChallenge): Promise<OtpChallenge> {
    return this.host.client.otpCode.create({ data: challenge });
  }

  async sentSince(recipient: string, purpose: OtpPurpose, since: Date): Promise<Date[]> {
    const rows = await this.host.client.otpCode.findMany({
      where: { recipient, purpose, createdAt: { gt: since } },
      select: { createdAt: true },
    });
    return rows.map((r) => r.createdAt);
  }

  async findActive(
    recipient: string,
    purpose: OtpPurpose,
    now: Date,
  ): Promise<OtpChallenge | null> {
    return this.host.client.otpCode.findFirst({
      where: { recipient, purpose, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async consumeAttempt(id: string, maxAttempts: number): Promise<boolean> {
    const { count } = await this.host.client.otpCode.updateMany({
      where: { id, consumedAt: null, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    return count === 1;
  }

  async markConsumed(id: string, at: Date): Promise<boolean> {
    const { count } = await this.host.client.otpCode.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: at },
    });
    return count === 1;
  }

  async invalidateActive(recipient: string, purpose: OtpPurpose, at: Date): Promise<void> {
    await this.host.client.otpCode.updateMany({
      where: { recipient, purpose, consumedAt: null },
      data: { consumedAt: at },
    });
  }
}
