import { Injectable } from '@nestjs/common';
import { type RequestContext } from '../../../common/auth/role.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { UserNotFoundError } from '../../users/domain/users.errors.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { CurrentPasswordIncorrectError, OtpInvalidError } from '../domain/auth.errors.js';
import { OtpPurpose } from '../domain/otp.js';
import { RefreshTokenRepository } from '../domain/refresh-token.js';
import { CODE_SENT, type CodeSent, EmailCodes } from './email-codes.js';
import { type AuthSession, SessionIssuer } from './session-issuer.js';

/** Emails a reset code. Same answer whether or not the account exists. */
@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    private readonly codes: EmailCodes,
    private readonly users: UserRepository,
  ) {}

  async execute(email: string): Promise<CodeSent> {
    const user = await this.users.findByEmail(email);
    if (user?.passwordHash && user.canLogin) {
      await this.codes.send(email, OtpPurpose.PASSWORD_RESET, user.fullName);
    }
    return CODE_SENT;
  }
}

export interface ResetPasswordInput {
  readonly email: string;
  readonly code: string;
  readonly newPassword: string;
}

/**
 * Sets a new password with the emailed code and signs out every session.
 * The code proves the address, so an unverified email becomes verified.
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly codes: EmailCodes,
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const challengeId = await this.codes.check(input.email, OtpPurpose.PASSWORD_RESET, input.code);
    const user = await this.users.findByEmail(input.email);
    if (!user) throw new OtpInvalidError();

    const passwordHash = await this.hasher.hash(input.newPassword);
    const now = this.clock.now();
    await this.uow.run(async () => {
      await this.codes.consume(challengeId, now);
      await this.users.updatePasswordHash(user.id, passwordHash);
      if (!user.isEmailVerified) await this.users.markEmailVerified(user.id, now);
      await this.refreshTokens.revokeAllForUser(user.id, now);
    });
  }
}

export interface ChangePasswordInput {
  readonly currentPassword: string;
  readonly newPassword: string;
}

/** Changes the password, revokes every other session and starts a fresh one. */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(
    userId: string,
    input: ChangePasswordInput,
    context: RequestContext,
  ): Promise<AuthSession> {
    const user = await this.users.findById(userId);
    if (!user) throw new UserNotFoundError();
    const matches =
      user.passwordHash !== null &&
      (await this.hasher.verify(user.passwordHash, input.currentPassword));
    if (!matches) throw new CurrentPasswordIncorrectError();

    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.uow.run(async () => {
      await this.users.updatePasswordHash(user.id, passwordHash);
      await this.refreshTokens.revokeAllForUser(user.id, this.clock.now());
    });
    return this.sessions.start(user, context);
  }
}
