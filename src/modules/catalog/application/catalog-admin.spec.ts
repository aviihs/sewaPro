import { beforeEach, describe, expect, it } from 'vitest';
import { aCategory, aService } from '../../../../test/unit/fixtures/catalog.js';
import { FakeUnitOfWork, FixedClock, actorOf, mockOf } from '../../../../test/unit/mock.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { CategoryRepository, ServiceRepository } from '../domain/catalog.repositories.js';
import {
  CategoryNameTakenError,
  CategoryNotFoundError,
  ServiceNameTakenError,
  ServiceNotFoundError,
  SlugTakenError,
} from '../domain/catalog.errors.js';
import { CatalogSnapshot } from './catalog-snapshot.js';
import {
  CreateCategoryUseCase,
  DeleteCategoryUseCase,
  UpdateCategoryUseCase,
} from './category-admin.use-cases.js';
import {
  CreateServiceUseCase,
  DeleteServiceUseCase,
  UpdateServiceUseCase,
} from './service-admin.use-cases.js';

const admin = actorOf('ADMIN');

describe('catalog admin use cases', () => {
  const categories = mockOf<CategoryRepository>();
  const services = mockOf<ServiceRepository>();
  const audit = mockOf<AuditTrail>();
  const snapshot = mockOf<CatalogSnapshot>();
  const clock = new FixedClock();
  const uow = new FakeUnitOfWork();

  beforeEach(() => {
    categories.findById.mockResolvedValue(aCategory());
    categories.nameTaken.mockResolvedValue(false);
    categories.slugExists.mockResolvedValue(false);
    categories.create.mockResolvedValue(aCategory());
    categories.update.mockResolvedValue(aCategory({ name: 'Electricians' }));
    services.findById.mockResolvedValue(aService());
    services.nameTaken.mockResolvedValue(false);
    services.slugExists.mockResolvedValue(false);
    services.create.mockResolvedValue(aService());
    services.update.mockResolvedValue(aService({ name: 'Ceiling Fan' }));
  });

  describe('categories', () => {
    it('creates with a generated slug, audits and invalidates the cache', async () => {
      await new CreateCategoryUseCase(categories, audit, snapshot, uow).execute(admin, {
        name: 'AC Technician',
      });
      expect(categories.create).toHaveBeenCalledWith({
        name: 'AC Technician',
        slug: 'ac-technician',
        description: null,
        iconUrl: null,
        sortOrder: 0,
        isActive: true,
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'category.created', actor: admin }),
      );
      expect(snapshot.invalidate).toHaveBeenCalled();
    });

    it('rejects duplicate names', async () => {
      categories.nameTaken.mockResolvedValue(true);
      await expect(
        new CreateCategoryUseCase(categories, audit, snapshot, uow).execute(admin, {
          name: 'Electrician',
        }),
      ).rejects.toBeInstanceOf(CategoryNameTakenError);
      expect(snapshot.invalidate).not.toHaveBeenCalled();
    });

    it('updates with before/after audit and checks name and slug conflicts', async () => {
      const useCase = new UpdateCategoryUseCase(categories, audit, snapshot, uow);
      await useCase.execute(admin, 'cat-1', { name: 'Electricians' });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'category.updated', before: aCategory() }),
      );
      categories.nameTaken.mockResolvedValueOnce(true);
      await expect(useCase.execute(admin, 'cat-1', { name: 'Plumber' })).rejects.toBeInstanceOf(
        CategoryNameTakenError,
      );
      categories.slugExists.mockResolvedValueOnce(true);
      await expect(useCase.execute(admin, 'cat-1', { slug: 'plumber' })).rejects.toBeInstanceOf(
        SlugTakenError,
      );
      categories.findById.mockResolvedValueOnce(null);
      await expect(useCase.execute(admin, 'x', {})).rejects.toBeInstanceOf(CategoryNotFoundError);
    });

    it('soft-deletes unused categories and deactivates linked ones', async () => {
      const useCase = new DeleteCategoryUseCase(categories, audit, snapshot, clock, uow);
      categories.hasActiveProviderLinks.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      await expect(useCase.execute(admin, 'cat-1')).resolves.toBe('DELETED');
      expect(categories.softDelete).toHaveBeenCalledWith('cat-1', clock.now());
      await expect(useCase.execute(admin, 'cat-1')).resolves.toBe('DEACTIVATED');
      expect(categories.update).toHaveBeenCalledWith('cat-1', { isActive: false });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'category.deactivated' }),
      );

      categories.findById.mockResolvedValueOnce(null);
      await expect(useCase.execute(admin, 'x')).rejects.toBeInstanceOf(CategoryNotFoundError);
    });
  });

  describe('services', () => {
    it('creates in an existing category', async () => {
      const useCase = new CreateServiceUseCase(services, categories, audit, snapshot, uow);
      await useCase.execute(admin, { categoryId: 'cat-1', name: 'Fan Installation', slug: 'fans' });
      expect(services.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'fans', isActive: true }),
      );

      services.nameTaken.mockResolvedValueOnce(true);
      await expect(
        useCase.execute(admin, { categoryId: 'cat-1', name: 'Fan' }),
      ).rejects.toBeInstanceOf(ServiceNameTakenError);
      categories.findById.mockResolvedValueOnce(null);
      await expect(useCase.execute(admin, { categoryId: 'x', name: 'Fan' })).rejects.toBeInstanceOf(
        CategoryNotFoundError,
      );
    });

    it('updates, moves between categories and checks conflicts', async () => {
      const useCase = new UpdateServiceUseCase(services, categories, audit, snapshot, uow);
      await useCase.execute(admin, 'svc-1', { description: 'Ceiling fans' });
      expect(services.nameTaken).not.toHaveBeenCalled();

      await useCase.execute(admin, 'svc-1', { categoryId: 'cat-2' });
      expect(services.nameTaken).toHaveBeenCalledWith('cat-2', 'Fan Installation', 'svc-1');

      categories.findById.mockResolvedValueOnce(null);
      await expect(useCase.execute(admin, 'svc-1', { categoryId: 'x' })).rejects.toBeInstanceOf(
        CategoryNotFoundError,
      );
      services.nameTaken.mockResolvedValueOnce(true);
      await expect(useCase.execute(admin, 'svc-1', { name: 'Wiring' })).rejects.toBeInstanceOf(
        ServiceNameTakenError,
      );
      services.slugExists.mockResolvedValueOnce(true);
      await expect(useCase.execute(admin, 'svc-1', { slug: 'wiring' })).rejects.toBeInstanceOf(
        SlugTakenError,
      );
      services.findById.mockResolvedValueOnce(null);
      await expect(useCase.execute(admin, 'x', {})).rejects.toBeInstanceOf(ServiceNotFoundError);
    });

    it('deactivates services offered by providers and deletes unused ones', async () => {
      const useCase = new DeleteServiceUseCase(services, audit, snapshot, clock, uow);
      services.hasActiveProviderLinks.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await expect(useCase.execute(admin, 'svc-1')).resolves.toBe('DEACTIVATED');
      await expect(useCase.execute(admin, 'svc-1')).resolves.toBe('DELETED');
      expect(services.softDelete).toHaveBeenCalledWith('svc-1', clock.now());
      services.findById.mockResolvedValueOnce(null);
      await expect(useCase.execute(admin, 'x')).rejects.toBeInstanceOf(ServiceNotFoundError);
    });
  });
});
