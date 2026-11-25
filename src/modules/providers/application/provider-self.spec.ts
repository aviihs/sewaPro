import { beforeEach, describe, expect, it } from 'vitest';
import { aCategory, aService } from '../../../../test/unit/fixtures/catalog.js';
import { aDocument, aProvider } from '../../../../test/unit/fixtures/providers.js';
import { aUser } from '../../../../test/unit/fixtures/users.js';
import { FakeUnitOfWork, FixedClock, mockOf } from '../../../../test/unit/mock.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { EmailCodes } from '../../auth/application/email-codes.js';
import {
  CategoryRepository,
  ServiceRepository,
} from '../../catalog/domain/catalog.repositories.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import {
  DocumentRepository,
  OfferingRepository,
  ProviderRepository,
  ProviderStatsReader,
} from '../domain/provider.repositories.js';
import {
  DocumentsRequiredError,
  InvalidPricingError,
  InvalidVerificationTransitionError,
  OfferingNotFoundError,
  ProviderNotFoundError,
  ServiceUnavailableForOfferingError,
} from '../domain/providers.errors.js';
import { GetEarningsSummaryUseCase, GetProviderDashboardUseCase } from './dashboard.use-cases.js';
import {
  ListMyOfferingsUseCase,
  RemoveMyOfferingUseCase,
  UpsertMyOfferingUseCase,
} from './offerings.use-cases.js';
import {
  GetMyProviderProfileUseCase,
  ResubmitVerificationUseCase,
  UpdateMyProviderProfileUseCase,
} from './profile.use-cases.js';
import { RegisterProviderUseCase } from './register-provider.use-case.js';

const providers = mockOf<ProviderRepository>();
const clock: Clock = new FixedClock();

beforeEach(() => {
  providers.findByUserId.mockResolvedValue(aProvider());
});

describe('RegisterProviderUseCase', () => {
  it('creates a PENDING provider account and profile in one transaction, then emails a code', async () => {
    const users = mockOf<UserRepository>();
    const hasher = mockOf<PasswordHasher>();
    const codes = mockOf<EmailCodes>();
    const uow = new FakeUnitOfWork();
    hasher.hash.mockResolvedValue('hash');
    const created = aUser({ id: 'u-p', role: 'PROVIDER', status: 'PENDING', fullName: 'Ram' });
    users.create.mockResolvedValue(created);
    codes.send.mockResolvedValue(true);
    const input = {
      fullName: 'Ram',
      email: 'ram@x.com',
      phone: '+9779841234567',
      password: 'pass1234',
      businessName: null,
      bio: null,
      experienceYears: 3,
      latitude: 27.7,
      longitude: 85.3,
      serviceRadiusKm: 8,
    };

    const result = await new RegisterProviderUseCase(
      users,
      providers,
      hasher,
      codes,
      clock,
      uow,
    ).execute(input);

    expect(uow.runs).toBe(1);
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'PROVIDER',
        status: 'PENDING',
        passwordHash: 'hash',
        emailVerifiedAt: null,
      }),
    );
    expect(providers.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-p', serviceRadiusKm: 8, submittedAt: clock.now() }),
      { maxDailyBookings: 5, slotMinutes: 60 },
    );
    expect(codes.send).toHaveBeenCalledWith('ram@x.com', 'EMAIL_VERIFICATION', 'Ram');
    expect(result).toEqual({
      user: created,
      verification: { expiresInSeconds: 600, resendAfterSeconds: 60 },
    });
  });
});

describe('profile use cases', () => {
  it('returns and updates the own profile', async () => {
    await expect(
      new GetMyProviderProfileUseCase(providers).execute('user-p1'),
    ).resolves.toMatchObject({ id: 'prov-1' });
    providers.updateProfile.mockResolvedValue(aProvider({ isAvailable: false }));
    const updated = await new UpdateMyProviderProfileUseCase(providers).execute('user-p1', {
      isAvailable: false,
    });
    expect(updated.isAvailable).toBe(false);
    expect(providers.updateProfile).toHaveBeenCalledWith('prov-1', { isAvailable: false });
  });

  it('fails when the user has no provider profile', async () => {
    providers.findByUserId.mockResolvedValue(null);
    await expect(new GetMyProviderProfileUseCase(providers).execute('x')).rejects.toBeInstanceOf(
      ProviderNotFoundError,
    );
  });

  describe('ResubmitVerificationUseCase', () => {
    const documents = mockOf<DocumentRepository>();
    const useCase = new ResubmitVerificationUseCase(
      providers,
      documents,
      clock,
      new FakeUnitOfWork(),
    );

    it('puts a rejected provider with new documents back in review', async () => {
      providers.findByUserId.mockResolvedValue(
        aProvider({ verificationStatus: 'REJECTED', rejectionReason: 'x' }),
      );
      documents.count.mockResolvedValue(1);
      providers.saveVerification.mockImplementation((p) => Promise.resolve(p));
      const result = await useCase.execute('user-p1');
      expect(result).toMatchObject({
        verificationStatus: 'PENDING_VERIFICATION',
        rejectionReason: null,
      });
      expect(documents.count).toHaveBeenCalledWith('prov-1', 'PENDING');
    });

    it('requires a new document and a rejected status', async () => {
      providers.findByUserId.mockResolvedValue(aProvider({ verificationStatus: 'REJECTED' }));
      documents.count.mockResolvedValue(0);
      await expect(useCase.execute('user-p1')).rejects.toBeInstanceOf(DocumentsRequiredError);
      providers.findByUserId.mockResolvedValue(aProvider());
      await expect(useCase.execute('user-p1')).rejects.toBeInstanceOf(
        InvalidVerificationTransitionError,
      );
    });
  });
});

describe('offering use cases', () => {
  const offerings = mockOf<OfferingRepository>();
  const services = mockOf<ServiceRepository>();
  const categories = mockOf<CategoryRepository>();
  const upsert = new UpsertMyOfferingUseCase(providers, offerings, services, categories);
  const input = { pricingType: 'FIXED' as const, price: 500, description: null, isActive: true };

  beforeEach(() => {
    services.findById.mockResolvedValue(aService());
    categories.findById.mockResolvedValue(aCategory());
  });

  it('lists and upserts offerings for active services', async () => {
    offerings.listByProvider.mockResolvedValue([]);
    await expect(
      new ListMyOfferingsUseCase(providers, offerings).execute('user-p1'),
    ).resolves.toEqual([]);
    await upsert.execute('user-p1', 'svc-1', input);
    expect(offerings.upsert).toHaveBeenCalledWith('prov-1', 'svc-1', input);
  });

  it('validates pricing and service availability', async () => {
    await expect(
      upsert.execute('user-p1', 'svc-1', { ...input, price: null }),
    ).rejects.toBeInstanceOf(InvalidPricingError);
    services.findById.mockResolvedValueOnce(aService({ isActive: false }));
    await expect(upsert.execute('user-p1', 'svc-1', input)).rejects.toBeInstanceOf(
      ServiceUnavailableForOfferingError,
    );
    categories.findById.mockResolvedValueOnce(aCategory({ isActive: false }));
    await expect(upsert.execute('user-p1', 'svc-1', input)).rejects.toBeInstanceOf(
      ServiceUnavailableForOfferingError,
    );
    services.findById.mockResolvedValueOnce(null);
    await expect(upsert.execute('user-p1', 'x', input)).rejects.toBeInstanceOf(
      ServiceUnavailableForOfferingError,
    );
  });

  it('removes offerings or reports that none existed', async () => {
    const remove = new RemoveMyOfferingUseCase(providers, offerings);
    offerings.remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(remove.execute('user-p1', 'svc-1')).resolves.toBeUndefined();
    await expect(remove.execute('user-p1', 'svc-1')).rejects.toBeInstanceOf(OfferingNotFoundError);
  });
});

describe('dashboard use cases', () => {
  const stats = mockOf<ProviderStatsReader>();

  it('returns booking counts for today (Nepal time)', async () => {
    const counts = {
      pending: 1,
      accepted: 0,
      inProgress: 0,
      completed: 2,
      cancelled: 0,
      disputed: 0,
      scheduledToday: 1,
    };
    stats.bookingCounts.mockResolvedValue(counts);
    const result = await new GetProviderDashboardUseCase(providers, stats, clock).execute(
      'user-p1',
    );
    expect(result.bookings).toEqual(counts);
    expect(stats.bookingCounts).toHaveBeenCalledWith('prov-1', {
      start: new Date('2030-01-06T18:15:00.000Z'),
      end: new Date('2030-01-07T18:15:00.000Z'),
    });
  });

  it('summarises completed totals for all time and the current month', async () => {
    stats.completedTotals
      .mockResolvedValueOnce({ completedJobs: 5, totalAmount: 9000 })
      .mockResolvedValueOnce({
        completedJobs: 1,
        totalAmount: 1500,
      });
    const result = await new GetEarningsSummaryUseCase(providers, stats, clock).execute('user-p1');
    expect(result).toEqual({
      allTime: { completedJobs: 5, totalAmount: 9000 },
      thisMonth: { completedJobs: 1, totalAmount: 1500 },
    });
  });
});

it('documents fixture is pending by default', () => {
  expect(aDocument().status).toBe('PENDING');
});
