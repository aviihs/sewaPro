import { Injectable } from '@nestjs/common';
import { type Actor } from '../../../common/auth/role.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { UserStatus } from '../../users/domain/user.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { DocumentStatus } from '../domain/media.js';
import { type Provider, VerificationStatus } from '../domain/provider.js';
import {
  ProviderRejectedEvent,
  ProviderSuspendedEvent,
  ProviderVerifiedEvent,
} from '../domain/provider.events.js';
import { DocumentRepository, ProviderRepository } from '../domain/provider.repositories.js';
import { DocumentsRequiredError, ProviderNotFoundError } from '../domain/providers.errors.js';

const snapshot = (p: Provider) => ({
  verificationStatus: p.verificationStatus,
  rejectionReason: p.rejectionReason,
});

/** Shared dependencies of the three admin decisions. */
@Injectable()
export class VerificationDeps {
  constructor(
    readonly providers: ProviderRepository,
    readonly documents: DocumentRepository,
    readonly users: UserRepository,
    readonly audit: AuditTrail,
    readonly events: DomainEventPublisher,
    readonly clock: Clock,
    readonly uow: UnitOfWork,
  ) {}

  async load(id: string): Promise<Provider> {
    const provider = await this.providers.findById(id);
    if (!provider) throw new ProviderNotFoundError();
    return provider;
  }

  async record(
    actor: Actor,
    action: string,
    before: Provider,
    after: Provider,
    reason?: string,
  ): Promise<void> {
    await this.audit.record({
      actor,
      action,
      entityType: 'Provider',
      entityId: after.id,
      before: snapshot(before),
      after: { ...snapshot(after), ...(reason ? { reason } : {}) },
    });
  }
}

/** Approves a pending provider (documents required) or reinstates a suspended one. */
@Injectable()
export class VerifyProviderUseCase {
  constructor(private readonly deps: VerificationDeps) {}

  async execute(actor: Actor, providerId: string): Promise<Provider> {
    const { deps } = this;
    const now = deps.clock.now();
    const verified = await deps.uow.run(async () => {
      const before = await deps.load(providerId);
      const after = before.verify(now);
      const firstApproval = before.verificationStatus === VerificationStatus.PENDING_VERIFICATION;
      if (firstApproval && (await deps.documents.count(before.id)) === 0)
        throw new DocumentsRequiredError();
      const saved = await deps.providers.saveVerification(after);
      await deps.documents.reviewPending(before.id, DocumentStatus.APPROVED, null);
      const user = await deps.users.findById(before.userId);
      if (user?.status === UserStatus.PENDING)
        await deps.users.setStatus(user.id, UserStatus.ACTIVE);
      await deps.record(actor, 'provider.verified', before, saved);
      return saved;
    });
    await deps.events.publish(
      new ProviderVerifiedEvent({ providerId: verified.id, userId: verified.userId }, now),
    );
    return verified;
  }
}

/** Rejects a pending provider with a reason; they may upload new documents and resubmit. */
@Injectable()
export class RejectProviderUseCase {
  constructor(private readonly deps: VerificationDeps) {}

  async execute(actor: Actor, providerId: string, reason: string): Promise<Provider> {
    const { deps } = this;
    const rejected = await deps.uow.run(async () => {
      const before = await deps.load(providerId);
      const saved = await deps.providers.saveVerification(before.reject(reason));
      await deps.documents.reviewPending(before.id, DocumentStatus.REJECTED, reason);
      await deps.record(actor, 'provider.rejected', before, saved, reason);
      return saved;
    });
    const data = { providerId: rejected.id, userId: rejected.userId, reason };
    await deps.events.publish(new ProviderRejectedEvent(data, deps.clock.now()));
    return rejected;
  }
}

/** Takes a verified provider out of search and bookings. Reinstate with verify. */
@Injectable()
export class SuspendProviderUseCase {
  constructor(private readonly deps: VerificationDeps) {}

  async execute(actor: Actor, providerId: string, reason: string): Promise<Provider> {
    const { deps } = this;
    const suspended = await deps.uow.run(async () => {
      const before = await deps.load(providerId);
      const saved = await deps.providers.saveVerification(before.suspend());
      await deps.record(actor, 'provider.suspended', before, saved, reason);
      return saved;
    });
    const data = { providerId: suspended.id, userId: suspended.userId, reason };
    await deps.events.publish(new ProviderSuspendedEvent(data, deps.clock.now()));
    return suspended;
  }
}
