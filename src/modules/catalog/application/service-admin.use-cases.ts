import { Injectable } from '@nestjs/common';
import { type Actor } from '../../../common/auth/role.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import {
  RemovalOutcome,
  type Service,
  type ServiceChanges,
  removalOutcome,
} from '../domain/catalog.js';
import { CategoryRepository, ServiceRepository } from '../domain/catalog.repositories.js';
import {
  CategoryNotFoundError,
  ServiceNameTakenError,
  ServiceNotFoundError,
  SlugTakenError,
} from '../domain/catalog.errors.js';
import { CatalogSnapshot, resolveSlug } from './catalog-snapshot.js';

export interface CreateServiceInput {
  readonly categoryId: string;
  readonly name: string;
  readonly slug?: string;
  readonly description?: string;
  readonly isActive?: boolean;
}

@Injectable()
export class CreateServiceUseCase {
  constructor(
    private readonly services: ServiceRepository,
    private readonly categories: CategoryRepository,
    private readonly audit: AuditTrail,
    private readonly snapshot: CatalogSnapshot,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(actor: Actor, input: CreateServiceInput): Promise<Service> {
    const created = await this.uow.run(async () => {
      if (!(await this.categories.findById(input.categoryId))) throw new CategoryNotFoundError();
      if (await this.services.nameTaken(input.categoryId, input.name))
        throw new ServiceNameTakenError();
      const slug = await resolveSlug(input.slug, input.name, (s) => this.services.slugExists(s));
      const service = await this.services.create({
        categoryId: input.categoryId,
        name: input.name,
        slug,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
      });
      await this.audit.record({
        actor,
        action: 'service.created',
        entityType: 'Service',
        entityId: service.id,
        after: service,
      });
      return service;
    });
    await this.snapshot.invalidate();
    return created;
  }
}

@Injectable()
export class UpdateServiceUseCase {
  constructor(
    private readonly services: ServiceRepository,
    private readonly categories: CategoryRepository,
    private readonly audit: AuditTrail,
    private readonly snapshot: CatalogSnapshot,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(actor: Actor, id: string, changes: ServiceChanges): Promise<Service> {
    const updated = await this.uow.run(async () => {
      const before = await this.services.findById(id);
      if (!before) throw new ServiceNotFoundError();
      const categoryId = changes.categoryId ?? before.categoryId;
      if (changes.categoryId && !(await this.categories.findById(changes.categoryId))) {
        throw new CategoryNotFoundError();
      }
      const name = changes.name ?? before.name;
      const renamedOrMoved = name !== before.name || categoryId !== before.categoryId;
      if (renamedOrMoved && (await this.services.nameTaken(categoryId, name, id))) {
        throw new ServiceNameTakenError();
      }
      if (
        changes.slug &&
        changes.slug !== before.slug &&
        (await this.services.slugExists(changes.slug))
      ) {
        throw new SlugTakenError(changes.slug);
      }
      const after = await this.services.update(id, changes);
      await this.audit.record({
        actor,
        action: 'service.updated',
        entityType: 'Service',
        entityId: id,
        before,
        after,
      });
      return after;
    });
    await this.snapshot.invalidate();
    return updated;
  }
}

/** Soft-deletes the service, or only deactivates it while providers still offer it. */
@Injectable()
export class DeleteServiceUseCase {
  constructor(
    private readonly services: ServiceRepository,
    private readonly audit: AuditTrail,
    private readonly snapshot: CatalogSnapshot,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(actor: Actor, id: string): Promise<RemovalOutcome> {
    const outcome = await this.uow.run(async () => {
      const before = await this.services.findById(id);
      if (!before) throw new ServiceNotFoundError();
      const result = removalOutcome(await this.services.hasActiveProviderLinks(id));
      if (result === RemovalOutcome.DEACTIVATED)
        await this.services.update(id, { isActive: false });
      else await this.services.softDelete(id, this.clock.now());
      const action = result === RemovalOutcome.DELETED ? 'service.deleted' : 'service.deactivated';
      await this.audit.record({ actor, action, entityType: 'Service', entityId: id, before });
      return result;
    });
    await this.snapshot.invalidate();
    return outcome;
  }
}
