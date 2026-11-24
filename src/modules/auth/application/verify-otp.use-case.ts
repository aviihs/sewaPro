import { Injectable } from '@nestjs/common';
import { Role, type RequestContext } from '../../../common/auth/role.js';
import { AccountSuspendedError } from '../../../common/errors/auth.errors.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { type User, UserStatus } from '../../users/domain/user.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { FullNameRequiredError, OtpInvalidError } from '../domain/auth.errors.js';
import { OTP_POLICY, OtpChallengeRepository, OtpPurpose } from '../domain/otp.js';
import { AuthSecrets } from './auth.ports.js';
import { type AuthSession, SessionIssuer } from './session-issuer.js';

export interface VerifyOtpInput {
  readonly phone: string;
  readonly code: string;
  /** Required only the first time a phone signs in (creates a customer account). */
  readonly fullName?: string;
}

/**
 * Phone + OTP sign-in. An attempt is spent atomically before comparing, so
 * parallel guesses cannot exceed the limit. A correct code for an unknown
 * phone without `fullName` is NOT consumed, so the caller can retry with it.
 */
@Injectable()
export class VerifyOtpUseCase {
  constructor(
    private readonly challenges: OtpChallengeRepository,
    private readonly users: UserRepository,
    private readonly secrets: AuthSecrets,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: VerifyOtpInput, context: RequestContext): Promise<AuthSession> {
    const now = this.clock.now();
    const challenge = await this.challenges.findActive(input.phone, OtpPurpose.LOGIN, now);
    if (!challenge) throw new OtpInvalidError();
    if (!(await this.challenges.consumeAttempt(challenge.id, OTP_POLICY.maxAttempts))) {
      throw new OtpInvalidError();
    }
    if (!this.secrets.otpMatches(input.phone, input.code, challenge.codeHash)) {
      throw new OtpInvalidError();
    }

    const existing = await this.users.findByPhone(input.phone);
    if (!existing && !input.fullName) throw new FullNameRequiredError();
    if (existing && !existing.canLogin) throw new AccountSuspendedError();

    const user = await this.uow.run(async () => {
      if (!(await this.challenges.markConsumed(challenge.id, now))) throw new OtpInvalidError();
      return existing
        ? this.signIn(existing, now)
        : this.users.create({
            role: Role.CUSTOMER,
            status: UserStatus.ACTIVE,
            fullName: input.fullName ?? '',
            email: null,
            phone: input.phone,
            passwordHash: null,
            phoneVerifiedAt: now,
          });
    });
    return this.sessions.start(user, context);
  }

  private async signIn(user: User, now: Date): Promise<User> {
    if (!user.isPhoneVerified) await this.users.markPhoneVerified(user.id, now);
    await this.users.recordLogin(user.id, now);
    return user;
  }
}
