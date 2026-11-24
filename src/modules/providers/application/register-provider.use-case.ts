import { Injectable } from '@nestjs/common';
import { Role, type RequestContext } from '../../../common/auth/role.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { type AuthSession, SessionIssuer } from '../../auth/application/session-issuer.js';
import { UserStatus } from '../../users/domain/user.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { DEFAULT_SETTINGS } from '../domain/availability.js';
import { ProviderRepository } from '../domain/provider.repositories.js';

export interface RegisterProviderInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly password: string;
  readonly businessName: string | null;
  readonly bio: string | null;
  readonly experienceYears: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly serviceRadiusKm: number;
}

/**
 * Creates the PROVIDER account (status PENDING) and the provider profile
 * (PENDING_VERIFICATION) atomically, then signs the user in so they can
 * upload documents. Invisible to customers until an admin verifies it.
 */
@Injectable()
export class RegisterProviderUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly providers: ProviderRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: RegisterProviderInput, context: RequestContext): Promise<AuthSession> {
    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.uow.run(async () => {
      const created = await this.users.create({
        role: Role.PROVIDER,
        status: UserStatus.PENDING,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        phoneVerifiedAt: null,
      });
      await this.providers.create(
        {
          userId: created.id,
          businessName: input.businessName,
          bio: input.bio,
          experienceYears: input.experienceYears,
          latitude: input.latitude,
          longitude: input.longitude,
          serviceRadiusKm: input.serviceRadiusKm,
          submittedAt: this.clock.now(),
        },
        DEFAULT_SETTINGS,
      );
      return created;
    });
    return this.sessions.start(user, context);
  }
}
