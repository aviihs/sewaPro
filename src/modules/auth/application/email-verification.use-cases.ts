import { Injectable } from '@nestjs/common';
import { type RequestContext } from '../../../common/auth/role.js';
import { AccountSuspendedError } from '../../../common/errors/auth.errors.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { OtpInvalidError } from '../domain/auth.errors.js';
import { OtpPurpose } from '../domain/otp.js';
import { CODE_SENT, type CodeSent, EmailCodes } from './email-codes.js';
import { type AuthSession, SessionIssuer } from './session-issuer.js';

export interface VerifyEmailInput {
  readonly email: string;
  readonly code: string;
}

/** Confirms the email with the emailed code and signs the user in. */
@Injectable()
export class VerifyEmailUseCase {
  constructor(
    private readonly codes: EmailCodes,
    private readonly users: UserRepository,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: VerifyEmailInput, context: RequestContext): Promise<AuthSession> {
    const challengeId = await this.codes.check(
      input.email,
      OtpPurpose.EMAIL_VERIFICATION,
      input.code,
    );
    const existing = await this.users.findByEmail(input.email);
    if (!existing) throw new OtpInvalidError();
    if (!existing.canLogin) throw new AccountSuspendedError();

    const now = this.clock.now();
    const user = await this.uow.run(async () => {
      await this.codes.consume(challengeId, now);
      await this.users.recordLogin(existing.id, now);
      return existing.isEmailVerified ? existing : this.users.markEmailVerified(existing.id, now);
    });
    return this.sessions.start(user, context);
  }
}

/**
 * Sends a new verification code. Answers the same for unknown, already
 * verified and rate-limited addresses, so accounts cannot be enumerated.
 */
@Injectable()
export class ResendVerificationUseCase {
  constructor(
    private readonly codes: EmailCodes,
    private readonly users: UserRepository,
  ) {}

  async execute(email: string): Promise<CodeSent> {
    const user = await this.users.findByEmail(email);
    if (user && !user.isEmailVerified && user.canLogin) {
      await this.codes.send(email, OtpPurpose.EMAIL_VERIFICATION, user.fullName);
    }
    return CODE_SENT;
  }
}
