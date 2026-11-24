import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/ports/clock.port.js';
import { SmsSender } from '../../../common/ports/messaging.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { OtpRateLimitedError } from '../domain/auth.errors.js';
import {
  OTP_POLICY,
  OtpChallengeRepository,
  OtpPurpose,
  otpSendRetryAfter,
} from '../domain/otp.js';
import { AuthSecrets } from './auth.ports.js';

export interface OtpSent {
  readonly expiresInSeconds: number;
  readonly resendAfterSeconds: number;
}

/**
 * Sends a login code. The response is identical whether or not an account
 * exists for the phone (no enumeration); rate limits are per phone.
 */
@Injectable()
export class SendOtpUseCase {
  constructor(
    private readonly challenges: OtpChallengeRepository,
    private readonly secrets: AuthSecrets,
    private readonly sms: SmsSender,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(phone: string): Promise<OtpSent> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - OTP_POLICY.sendWindowSeconds * 1000);
    const recent = await this.challenges.sentSince(phone, OtpPurpose.LOGIN, since);
    const retryAfter = otpSendRetryAfter(recent, now);
    if (retryAfter > 0) throw new OtpRateLimitedError(retryAfter);

    const code = this.secrets.newOtpCode();
    await this.uow.run(async () => {
      await this.challenges.invalidateActive(phone, OtpPurpose.LOGIN, now);
      await this.challenges.create({
        phone,
        purpose: OtpPurpose.LOGIN,
        codeHash: this.secrets.hashOtp(phone, code),
        expiresAt: new Date(now.getTime() + OTP_POLICY.ttlSeconds * 1000),
      });
    });
    const minutes = OTP_POLICY.ttlSeconds / 60;
    await this.sms.send(
      phone,
      `Your SewaPro code is ${code}. It expires in ${minutes} minutes. Never share it.`,
    );
    return {
      expiresInSeconds: OTP_POLICY.ttlSeconds,
      resendAfterSeconds: OTP_POLICY.resendCooldownSeconds,
    };
  }
}
