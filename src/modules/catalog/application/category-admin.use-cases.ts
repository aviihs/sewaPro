import { Injectable } from '@nestjs/common';
import { type Actor } from '../../../common/auth/role.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import {
  type Category,
  type CategoryChanges,
  RemovalOutcome,
  removalOutcome,
} from '../domain/catalog.js';
import { CategoryRepository } from '../domain/catalog.repositories.js';
import {
  CategoryNameTakenError,
  CategoryNotFoundError,
  SlugTakenError,
} from '../domain/catalog.errors.js';
import { CatalogSnapshot, resolveSlug } from './catalog-snapshot.js';

export interface CreateCategoryInput {
  readonly name: string;
  readonly slug?: string;
  readonly description?: string;
  readonly iconUrl?: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

@Injectable()
export class CreateCategoryUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly audit: AuditTrail,
    private readonly snapshot: CatalogSnapshot,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(actor: Actor, input: CreateCategoryInput): Promise<Category> {
    const created = await this.uow.run(async () => {
      if (await this.categories.nameTaken(input.name)) throw new CategoryNameTakenError();
      const slug = await resolveSlug(input.slug, input.name, (s) => this.categories.slugExists(s));
      const category = await this.categories.create({
        name: input.name,
        slug,
        description: input.description ?? null,
        iconUrl: input.iconUrl ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      });
      await this.audit.record({
        actor,
        action: 'category.created',
        entityType: 'Category',
        entityId: category.id,
        after: category,
      });
      return category;
    });
    await this.snapshot.invalidate();
    return created;
  }
}

@Injectable()
export class UpdateCategoryUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly audit: AuditTrail,
    private readonly snapshot: CatalogSnapshot,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(actor: Actor, id: string, changes: CategoryChanges): Promise<Category> {
    const updated = await this.uow.run(async () => {
      const before = await this.categories.findById(id);
      if (!before) throw new CategoryNotFoundError();
      if (
        changes.name &&
        changes.name !== before.name &&
        (await this.categories.nameTaken(changes.name, id))
      ) {
        throw new CategoryNameTakenError();
      }
      if (
        changes.slug &&
        changes.slug !== before.slug &&
        (await this.categories.slugExists(changes.slug))
      ) {
        throw new SlugTakenError(changes.slug);
      }
      const after = await this.categories.update(id, changes);
      await this.audit.record({
        actor,
        action: 'category.updated',
        entityType: 'Category',
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

/** Soft-deletes the category (and its services), or only deactivates it if providers offer any of its services. */
@Injectable()
export class DeleteCategoryUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly audit: AuditTrail,
    private readonly snapshot: CatalogSnapshot,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(actor: Actor, id: string): Promise<RemovalOutcome> {
    const outcome = await this.uow.run(async () => {
      const before = await this.categories.findById(id);
      if (!before) throw new CategoryNotFoundError();
      const result = removalOutcome(await this.categories.hasActiveProviderLinks(id));
      if (result === RemovalOutcome.DEACTIVATED)
        await this.categories.update(id, { isActive: false });
      else await this.categories.softDelete(id, this.clock.now());
      const action =
        result === RemovalOutcome.DELETED ? 'category.deleted' : 'category.deactivated';
      await this.audit.record({ actor, action, entityType: 'Category', entityId: id, before });
      return result;
    });
    await this.snapshot.invalidate();
    return outcome;
  }
}
