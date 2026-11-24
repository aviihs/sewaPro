import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type RequestContext } from '../../../common/auth/role.js';
import { AccountSuspendedError } from '../../../common/errors/auth.errors.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { InvalidCredentialsError } from '../domain/auth.errors.js';
import { type AuthSession, SessionIssuer } from './session-issuer.js';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

/**
 * Email + password login. Unknown emails and wrong passwords produce the same
 * error after the same amount of hashing work, so accounts cannot be enumerated.
 * Suspension is only revealed to someone who knows the password.
 */
@Injectable()
export class LoginUseCase {
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(input: LoginInput, context: RequestContext): Promise<AuthSession> {
    const user = await this.users.findByEmail(input.email);
    if (!user?.passwordHash) {
      await this.hasher.verify(await this.getDummyHash(), input.password);
      throw new InvalidCredentialsError();
    }
    if (!(await this.hasher.verify(user.passwordHash, input.password))) {
      throw new InvalidCredentialsError();
    }
    if (!user.canLogin) throw new AccountSuspendedError();

    await this.users.recordLogin(user.id, this.clock.now());
    return this.sessions.start(user, context);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}
