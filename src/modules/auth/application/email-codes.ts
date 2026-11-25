import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/ports/clock.port.js';
import { EmailSender } from '../../../common/ports/messaging.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { OtpInvalidError } from '../domain/auth.errors.js';
import {
  OTP_POLICY,
  OtpChallengeRepository,
  OtpPurpose,
  otpSendRetryAfter,
} from '../domain/otp.js';
import { AuthSecrets } from './auth.ports.js';

/** What the client is told after a code is (or would have been) sent. */
export interface CodeSent {
  readonly expiresInSeconds: number;
  readonly resendAfterSeconds: number;
}

export const CODE_SENT: CodeSent = {
  expiresInSeconds: OTP_POLICY.ttlSeconds,
  resendAfterSeconds: OTP_POLICY.resendCooldownSeconds,
};

const MESSAGES: Record<OtpPurpose, { subject: string; intro: string }> = {
  EMAIL_VERIFICATION: {
    subject: 'Verify your SewaPro email',
    intro: 'Use this code to verify your email address',
  },
  PASSWORD_RESET: {
    subject: 'Reset your SewaPro password',
    intro: 'Use this code to reset your password',
  },
};

/**
 * Issues and checks the 6-digit email codes used for email verification and
 * password reset (D-088). Only an HMAC of a code is stored; a new code burns
 * the previous ones; sends are rate limited per address and purpose.
 */
@Injectable()
export class EmailCodes {
  constructor(
    private readonly challenges: OtpChallengeRepository,
    private readonly secrets: AuthSecrets,
    private readonly email: EmailSender,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Sends a new code unless the address is inside its cooldown or send window.
   * Rate-limited requests are dropped silently, so callers can answer the same
   * way for every address (no account enumeration). Returns whether it sent.
   */
  async send(email: string, purpose: OtpPurpose, name: string): Promise<boolean> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - OTP_POLICY.sendWindowSeconds * 1000);
    const recent = await this.challenges.sentSince(email, purpose, since);
    if (otpSendRetryAfter(recent, now) > 0) return false;

    const code = this.secrets.newOtpCode();
    await this.uow.run(async () => {
      await this.challenges.invalidateActive(email, purpose, now);
      await this.challenges.create({
        recipient: email,
        purpose,
        codeHash: this.secrets.hashOtp(email, code),
        expiresAt: new Date(now.getTime() + OTP_POLICY.ttlSeconds * 1000),
      });
    });
    const { subject, intro } = MESSAGES[purpose];
    const minutes = OTP_POLICY.ttlSeconds / 60;
    await this.email.send(
      email,
      subject,
      `Hi ${name},\n\n${intro}: ${code}\n\nIt expires in ${String(minutes)} minutes. ` +
        'Never share it. If you did not ask for it, ignore this email.\n\nSewaPro',
    );
    return true;
  }

  /**
   * Checks a code and spends one attempt atomically before comparing, so
   * parallel guesses cannot exceed the limit. Returns the challenge id; the
   * caller marks it consumed (with `consume`) inside its own transaction.
   * @throws OtpInvalidError for a wrong, expired, used or exhausted code.
   */
  async check(email: string, purpose: OtpPurpose, code: string): Promise<string> {
    const challenge = await this.challenges.findActive(email, purpose, this.clock.now());
    if (!challenge) throw new OtpInvalidError();
    if (!(await this.challenges.consumeAttempt(challenge.id, OTP_POLICY.maxAttempts))) {
      throw new OtpInvalidError();
    }
    if (!this.secrets.otpMatches(email, code, challenge.codeHash)) throw new OtpInvalidError();
    return challenge.id;
  }

  /** Marks a checked code used; a concurrent second use loses. */
  async consume(challengeId: string, at: Date): Promise<void> {
    if (!(await this.challenges.markConsumed(challengeId, at))) throw new OtpInvalidError();
  }
}
