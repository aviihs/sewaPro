import { Injectable } from '@nestjs/common';
import { Role, type RequestContext } from '../../../common/auth/role.js';
import { PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { UserStatus } from '../../users/domain/user.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { type AuthSession, SessionIssuer } from './session-issuer.js';

export interface RegisterCustomerInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly password: string;
}

/** Email + password sign-up for customers. The phone is verified later via OTP login. */
@Injectable()
export class RegisterCustomerUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: RegisterCustomerInput, context: RequestContext): Promise<AuthSession> {
    const user = await this.users.create({
      role: Role.CUSTOMER,
      status: UserStatus.ACTIVE,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      passwordHash: await this.hasher.hash(input.password),
      phoneVerifiedAt: null,
    });
    return this.sessions.start(user, context);
  }
}
