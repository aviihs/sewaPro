import { Injectable } from '@nestjs/common';
import { type Actor, Role } from '../../../common/auth/role.js';
import { userStatusCacheKey } from '../../../common/auth/user-status-cache.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { Cache } from '../../../common/ports/cache.port.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import { RefreshTokenRepository } from '../../auth/domain/refresh-token.js';
import { VerificationStatus } from '../../providers/domain/provider.js';
import { ProviderRepository } from '../../providers/domain/provider.repositories.js';
import { type User, UserStatus } from '../../users/domain/user.js';
import { type UserListFilter, UserRepository } from '../../users/domain/user.repository.js';
import {
  CannotChangeOwnStatusError,
  InvalidStatusChangeError,
  UserNotFoundError,
} from '../../users/domain/users.errors.js';

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  execute(filter: UserListFilter, page: PageRequest): Promise<PaginatedResult<User>> {
    return this.users.list(filter, page);
  }
}

/** Shared steps: load target, change status, audit, and make the change effective immediately. */
@Injectable()
export class UserStatusChanger {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: RefreshTokenRepository,
    private readonly audit: AuditTrail,
    private readonly cache: Cache,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async change(
    actor: Actor,
    userId: string,
    next: (user: User) => UserStatus,
    action: string,
    reason: string,
  ): Promise<User> {
    if (actor.id === userId) throw new CannotChangeOwnStatusError();
    const updated = await this.uow.run(async () => {
      const user = await this.users.findById(userId);
      if (!user) throw new UserNotFoundError();
      const status = next(user);
      const saved = await this.users.setStatus(userId, status);
      if (status === UserStatus.SUSPENDED)
        await this.tokens.revokeAllForUser(userId, this.clock.now());
      await this.audit.record({
        actor,
        action,
        entityType: 'User',
        entityId: userId,
        before: { status: user.status },
        after: { status, reason },
      });
      return saved;
    });
    await this.cache.delete(userStatusCacheKey(userId));
    return updated;
  }
}

/** Blocks login, revokes every session, and rejects live access tokens within seconds. */
@Injectable()
export class SuspendUserUseCase {
  constructor(private readonly changer: UserStatusChanger) {}

  execute(actor: Actor, userId: string, reason: string): Promise<User> {
    return this.changer.change(
      actor,
      userId,
      (user) => {
        if (user.status === UserStatus.SUSPENDED)
          throw new InvalidStatusChangeError(user.status, UserStatus.SUSPENDED);
        return UserStatus.SUSPENDED;
      },
      'user.suspended',
      reason,
    );
  }
}

/** Back to ACTIVE, or PENDING for a provider whose profile is not verified yet. */
@Injectable()
export class ReactivateUserUseCase {
  constructor(
    private readonly changer: UserStatusChanger,
    private readonly providers: ProviderRepository,
  ) {}

  async execute(actor: Actor, userId: string, reason: string): Promise<User> {
    const provider = await this.providers.findByUserId(userId);
    const pending =
      provider !== null && provider.verificationStatus !== VerificationStatus.VERIFIED;
    return this.changer.change(
      actor,
      userId,
      (user) => {
        if (user.status !== UserStatus.SUSPENDED)
          throw new InvalidStatusChangeError(user.status, 'ACTIVE');
        return user.role === Role.PROVIDER && pending ? UserStatus.PENDING : UserStatus.ACTIVE;
      },
      'user.reactivated',
      reason,
    );
  }
}
