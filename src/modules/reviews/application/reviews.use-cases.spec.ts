import { beforeEach, describe, expect, it } from 'vitest';
import { aBooking } from '../../../../test/unit/fixtures/bookings.js';
import { aProvider } from '../../../../test/unit/fixtures/providers.js';
import { FakeUnitOfWork, FixedClock, actorOf, mockOf, userOf } from '../../../../test/unit/mock.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { PaginatedResult } from '../../../common/utils/pagination.js';
import { BookingRepository } from '../../bookings/domain/booking.repository.js';
import { BookingNotFoundError } from '../../bookings/domain/bookings.errors.js';
import { ProviderRepository } from '../../providers/domain/provider.repositories.js';
import { ProviderNotFoundError } from '../../providers/domain/providers.errors.js';
import { type Review, ReviewRepository, publicName, roundRating } from '../domain/review.js';
import {
  BookingNotReviewableError,
  ReviewAlreadyHiddenError,
  ReviewNotFoundError,
} from '../domain/reviews.errors.js';
import {
  CreateReviewUseCase,
  HideReviewUseCase,
  ListProviderReviewsUseCase,
  ListReviewsForModerationUseCase,
  RatingRecalculator,
} from './reviews.use-cases.js';

const completedAt = new Date('2030-01-07T06:00:00Z');
const clock = new FixedClock(new Date('2030-01-08T06:00:00Z'));
const ratings = {
  overall: 5,
  serviceQuality: 4,
  professionalism: 5,
  punctuality: 4,
  communication: 5,
};
const review: Review = {
  ...ratings,
  id: 'rv-1',
  bookingId: 'bk-1',
  customerId: 'cust-1',
  providerId: 'prov-1',
  comment: null,
  hiddenAt: null,
  hiddenReason: null,
  createdAt: clock.now(),
};
const page = { page: 1, limit: 20 };

describe('review helpers', () => {
  it('shortens public names and rounds ratings', () => {
    expect(publicName('Aarati Kumari Sharma')).toBe('Aarati S.');
    expect(publicName('Nabin')).toBe('Nabin');
    expect(roundRating(4.6666)).toBe(4.67);
  });
});

describe('review use cases', () => {
  const reviews = mockOf<ReviewRepository>();
  const bookings = mockOf<BookingRepository>();
  const providers = mockOf<ProviderRepository>();
  const events = mockOf<DomainEventPublisher>();
  const audit = mockOf<AuditTrail>();
  const recalculator = new RatingRecalculator(reviews, providers);
  const uow = new FakeUnitOfWork();

  beforeEach(() => {
    bookings.findById.mockResolvedValue(aBooking({ status: 'COMPLETED', completedAt }));
    reviews.create.mockResolvedValue(review);
    reviews.findById.mockResolvedValue(review);
    reviews.findView.mockResolvedValue({ review, customerName: 'Aarati Sharma' });
    reviews.aggregateVisible.mockResolvedValue({ average: 4.3333, count: 3 });
    reviews.hide.mockResolvedValue({ ...review, hiddenAt: clock.now(), hiddenReason: 'spam' });
  });

  describe('CreateReviewUseCase', () => {
    const create = new CreateReviewUseCase(reviews, bookings, recalculator, events, clock, uow);

    it('creates the review and recomputes the rating under a lock', async () => {
      const view = await create.execute(userOf('CUSTOMER', 'cust-1'), 'bk-1', {
        ...ratings,
        comment: null,
      });
      expect(view.customerName).toBe('Aarati Sharma');
      expect(reviews.create).toHaveBeenCalledWith({
        ...ratings,
        comment: null,
        bookingId: 'bk-1',
        customerId: 'cust-1',
        providerId: 'prov-1',
      });
      expect(reviews.lockProvider).toHaveBeenCalledWith('prov-1');
      expect(providers.setRating).toHaveBeenCalledWith('prov-1', 4.33, 3);
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'review.created' }),
      );
    });

    it('allows only the customer of a completed booking within 30 days', async () => {
      const user = userOf('CUSTOMER', 'cust-1');
      await expect(
        create.execute(userOf('CUSTOMER', 'x'), 'bk-1', { ...ratings, comment: null }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
      bookings.findById.mockResolvedValueOnce(aBooking({ status: 'IN_PROGRESS' }));
      await expect(
        create.execute(user, 'bk-1', { ...ratings, comment: null }),
      ).rejects.toMatchObject({
        details: { reason: 'NOT_COMPLETED' },
      });
      bookings.findById.mockResolvedValueOnce(
        aBooking({ status: 'COMPLETED', completedAt: new Date('2029-11-01T00:00:00Z') }),
      );
      await expect(
        create.execute(user, 'bk-1', { ...ratings, comment: null }),
      ).rejects.toBeInstanceOf(BookingNotReviewableError);
      expect(reviews.create).not.toHaveBeenCalled();
    });

    it('fails if the stored review cannot be read back', async () => {
      reviews.findView.mockResolvedValueOnce(null);
      await expect(
        create.execute(userOf('CUSTOMER', 'cust-1'), 'bk-1', { ...ratings, comment: null }),
      ).rejects.toBeInstanceOf(ReviewNotFoundError);
    });
  });

  describe('HideReviewUseCase', () => {
    const hide = new HideReviewUseCase(reviews, recalculator, audit, clock, uow);
    const admin = actorOf('ADMIN');

    it('hides, recalculates and audits', async () => {
      reviews.aggregateVisible.mockResolvedValueOnce({ average: 0, count: 0 });
      await hide.execute(admin, 'rv-1', 'Contains a phone number');
      expect(reviews.hide).toHaveBeenCalledWith(
        'rv-1',
        'admin-1',
        'Contains a phone number',
        clock.now(),
      );
      expect(providers.setRating).toHaveBeenCalledWith('prov-1', 0, 0);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'review.hidden', actor: admin }),
      );
    });

    it('refuses unknown or already hidden reviews', async () => {
      reviews.findById.mockResolvedValueOnce(null);
      await expect(hide.execute(admin, 'x', 'reason')).rejects.toBeInstanceOf(ReviewNotFoundError);
      reviews.findById.mockResolvedValueOnce({ ...review, hiddenAt: clock.now() });
      await expect(hide.execute(admin, 'rv-1', 'reason')).rejects.toBeInstanceOf(
        ReviewAlreadyHiddenError,
      );
      reviews.findView.mockResolvedValueOnce(null);
      await expect(hide.execute(admin, 'rv-1', 'reason')).rejects.toBeInstanceOf(
        ReviewNotFoundError,
      );
    });
  });

  it('lists public reviews of verified providers only', async () => {
    reviews.listVisibleForProvider.mockResolvedValue(PaginatedResult.of([], 0, page));
    const list = new ListProviderReviewsUseCase(reviews, providers);
    providers.findById.mockResolvedValueOnce(aProvider({ verificationStatus: 'VERIFIED' }));
    await expect(list.execute('prov-1', page)).resolves.toBeDefined();
    providers.findById.mockResolvedValueOnce(aProvider());
    await expect(list.execute('prov-1', page)).rejects.toBeInstanceOf(ProviderNotFoundError);
  });

  it('lists reviews for moderation with filters', async () => {
    reviews.listForModeration.mockResolvedValue(PaginatedResult.of([], 0, page));
    await new ListReviewsForModerationUseCase(reviews).execute(
      { hidden: true, maxOverall: 2 },
      page,
    );
    expect(reviews.listForModeration).toHaveBeenCalledWith({ hidden: true, maxOverall: 2 }, page);
  });
});
