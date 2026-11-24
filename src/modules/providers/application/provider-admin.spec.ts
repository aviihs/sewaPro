import { beforeEach, describe, expect, it } from 'vitest';
import { aDocument, aProvider } from '../../../../test/unit/fixtures/providers.js';
import { aUser } from '../../../../test/unit/fixtures/users.js';
import { FakeUnitOfWork, FixedClock, actorOf, mockOf } from '../../../../test/unit/mock.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { FileStorage } from '../../../common/ports/file-storage.port.js';
import { PaginatedResult } from '../../../common/utils/pagination.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { type Provider } from '../domain/provider.js';
import {
  DocumentRepository,
  OfferingRepository,
  ProviderRepository,
} from '../domain/provider.repositories.js';
import {
  DocumentsRequiredError,
  InvalidVerificationTransitionError,
  ProviderNotFoundError,
} from '../domain/providers.errors.js';
import {
  GetProviderForAdminUseCase,
  ListProviderDocumentsForAdminUseCase,
  ListProvidersForAdminUseCase,
} from './admin-providers.queries.js';
import {
  RejectProviderUseCase,
  SuspendProviderUseCase,
  VerificationDeps,
  VerifyProviderUseCase,
} from './admin-verification.use-cases.js';

const admin = actorOf('ADMIN');

describe('admin verification', () => {
  const providers = mockOf<ProviderRepository>();
  const documents = mockOf<DocumentRepository>();
  const users = mockOf<UserRepository>();
  const audit = mockOf<AuditTrail>();
  const events = mockOf<DomainEventPublisher>();
  const clock = new FixedClock();
  const deps = new VerificationDeps(
    providers,
    documents,
    users,
    audit,
    events,
    clock,
    new FakeUnitOfWork(),
  );

  beforeEach(() => {
    providers.findById.mockResolvedValue(aProvider());
    providers.saveVerification.mockImplementation((p: Provider) => Promise.resolve(p));
    documents.count.mockResolvedValue(2);
    users.findById.mockResolvedValue(aUser({ id: 'user-p1', role: 'PROVIDER', status: 'PENDING' }));
  });

  it('verifies a pending provider: approves documents, activates the account, audits and notifies', async () => {
    const result = await new VerifyProviderUseCase(deps).execute(admin, 'prov-1');

    expect(result.verificationStatus).toBe('VERIFIED');
    expect(documents.reviewPending).toHaveBeenCalledWith('prov-1', 'APPROVED', null);
    expect(users.setStatus).toHaveBeenCalledWith('user-p1', 'ACTIVE');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: admin,
        action: 'provider.verified',
        before: { verificationStatus: 'PENDING_VERIFICATION', rejectionReason: null },
        after: { verificationStatus: 'VERIFIED', rejectionReason: null },
      }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'provider.verified',
        data: { providerId: 'prov-1', userId: 'user-p1' },
      }),
    );
  });

  it('requires documents for a first approval but not for reinstatement', async () => {
    documents.count.mockResolvedValue(0);
    await expect(new VerifyProviderUseCase(deps).execute(admin, 'prov-1')).rejects.toBeInstanceOf(
      DocumentsRequiredError,
    );
    expect(events.publish).not.toHaveBeenCalled();

    providers.findById.mockResolvedValue(aProvider({ verificationStatus: 'SUSPENDED' }));
    users.findById.mockResolvedValue(aUser({ status: 'ACTIVE' }));
    await expect(new VerifyProviderUseCase(deps).execute(admin, 'prov-1')).resolves.toMatchObject({
      verificationStatus: 'VERIFIED',
    });
    expect(users.setStatus).not.toHaveBeenCalled();
  });

  it('rejects with a reason, marking pending documents rejected', async () => {
    const result = await new RejectProviderUseCase(deps).execute(
      admin,
      'prov-1',
      'Blurry citizenship scan',
    );
    expect(result).toMatchObject({
      verificationStatus: 'REJECTED',
      rejectionReason: 'Blurry citizenship scan',
    });
    expect(documents.reviewPending).toHaveBeenCalledWith(
      'prov-1',
      'REJECTED',
      'Blurry citizenship scan',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'provider.rejected' }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'provider.rejected' }),
    );
  });

  it('suspends verified providers with the reason in the audit log', async () => {
    providers.findById.mockResolvedValue(aProvider({ verificationStatus: 'VERIFIED' }));
    await new SuspendProviderUseCase(deps).execute(admin, 'prov-1', 'Repeated no-shows reported');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'provider.suspended',
        after: {
          verificationStatus: 'SUSPENDED',
          rejectionReason: null,
          reason: 'Repeated no-shows reported',
        },
      }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'provider.suspended' }),
    );
  });

  it('refuses illegal transitions and unknown providers', async () => {
    await expect(
      new SuspendProviderUseCase(deps).execute(admin, 'prov-1', 'x'.repeat(10)),
    ).rejects.toBeInstanceOf(InvalidVerificationTransitionError);
    providers.findById.mockResolvedValue(null);
    await expect(
      new RejectProviderUseCase(deps).execute(admin, 'x', 'reason text'),
    ).rejects.toBeInstanceOf(ProviderNotFoundError);
  });
});

describe('admin provider queries', () => {
  const providers = mockOf<ProviderRepository>();
  const documents = mockOf<DocumentRepository>();
  const offerings = mockOf<OfferingRepository>();
  const storage = mockOf<FileStorage>();
  const summary = {
    provider: aProvider(),
    fullName: 'Ram',
    phone: '+9779841234567',
    email: null,
    documentCount: 1,
  };

  beforeEach(() => {
    storage.signedUrl.mockReturnValue({ url: 'signed', expiresAt: new Date() });
    documents.list.mockResolvedValue([aDocument()]);
    offerings.listByProvider.mockResolvedValue([]);
  });

  it('lists providers with filters', async () => {
    const page = { page: 1, limit: 20 };
    providers.listForAdmin.mockResolvedValue(PaginatedResult.of([summary], 1, page));
    const result = await new ListProvidersForAdminUseCase(providers).execute(
      { status: 'PENDING_VERIFICATION' },
      page,
    );
    expect(result.items).toHaveLength(1);
  });

  it('returns detail with signed document links', async () => {
    providers.findAdminSummary.mockResolvedValueOnce(summary).mockResolvedValueOnce(null);
    const useCase = new GetProviderForAdminUseCase(providers, documents, offerings, storage);
    const detail = await useCase.execute('prov-1');
    expect(detail.documents[0]?.url).toBe('signed');
    await expect(useCase.execute('x')).rejects.toBeInstanceOf(ProviderNotFoundError);
  });

  it('lists documents for an existing provider', async () => {
    providers.findById.mockResolvedValueOnce(aProvider()).mockResolvedValueOnce(null);
    const useCase = new ListProviderDocumentsForAdminUseCase(providers, documents, storage);
    await expect(useCase.execute('prov-1')).resolves.toHaveLength(1);
    await expect(useCase.execute('x')).rejects.toBeInstanceOf(ProviderNotFoundError);
  });
});
