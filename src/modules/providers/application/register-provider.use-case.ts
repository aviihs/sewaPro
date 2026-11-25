import { Injectable } from '@nestjs/common';
import { Role } from '../../../common/auth/role.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { CODE_SENT, EmailCodes } from '../../auth/application/email-codes.js';
import { type PendingRegistration } from '../../auth/application/register-customer.use-case.js';
import { OtpPurpose } from '../../auth/domain/otp.js';
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
 * (PENDING_VERIFICATION) atomically, then emails a verification code. The
 * provider signs in with POST /auth/verify-email (D-088) to upload documents.
 * Invisible to customers until an admin verifies it.
 */
@Injectable()
export class RegisterProviderUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly providers: ProviderRepository,
    private readonly hasher: PasswordHasher,
    private readonly codes: EmailCodes,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(input: RegisterProviderInput): Promise<PendingRegistration> {
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
        emailVerifiedAt: null,
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
    await this.codes.send(input.email, OtpPurpose.EMAIL_VERIFICATION, user.fullName);
    return { user, verification: CODE_SENT };
  }
}
