import { Injectable } from '@nestjs/common';
import { Role } from '../../../common/auth/role.js';
import { PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { type User, UserStatus } from '../../users/domain/user.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { OtpPurpose } from '../domain/otp.js';
import { CODE_SENT, type CodeSent, EmailCodes } from './email-codes.js';

export interface RegisterCustomerInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly password: string;
}

/** A new account that must confirm its email before it can sign in. */
export interface PendingRegistration {
  readonly user: User;
  readonly verification: CodeSent;
}

/**
 * Email + password sign-up for customers. No session is issued: a code is
 * emailed and POST /auth/verify-email signs the user in (D-088). The phone is
 * stored unverified; phone verification comes later.
 */
@Injectable()
export class RegisterCustomerUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly codes: EmailCodes,
  ) {}

  async execute(input: RegisterCustomerInput): Promise<PendingRegistration> {
    const user = await this.users.create({
      role: Role.CUSTOMER,
      status: UserStatus.ACTIVE,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      passwordHash: await this.hasher.hash(input.password),
      phoneVerifiedAt: null,
      emailVerifiedAt: null,
    });
    await this.codes.send(input.email, OtpPurpose.EMAIL_VERIFICATION, user.fullName);
    return { user, verification: CODE_SENT };
  }
}
