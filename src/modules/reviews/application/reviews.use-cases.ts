import { Injectable } from '@nestjs/common';
import { type Actor, type AuthenticatedUser } from '../../../common/auth/role.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import { BookingStatus } from '../../bookings/domain/booking-state-machine.js';
import { BookingRepository } from '../../bookings/domain/booking.repository.js';
import { BookingNotFoundError } from '../../bookings/domain/bookings.errors.js';
import { VerificationStatus } from '../../providers/domain/provider.js';
import { ProviderRepository } from '../../providers/domain/provider.repositories.js';
import { ProviderNotFoundError } from '../../providers/domain/providers.errors.js';
import {
  REVIEW_WINDOW_DAYS,
  type Ratings,
  ReviewCreatedEvent,
  type ReviewModerationFilter,
  ReviewRepository,
  type ReviewView,
  roundRating,
} from '../domain/review.js';
import {
  BookingNotReviewableError,
  ReviewAlreadyHiddenError,
  ReviewNotFoundError,
} from '../domain/reviews.errors.js';

/** Recomputes the provider's rating from visible reviews, under a row lock. Call inside a unit of work. */
@Injectable()
export class RatingRecalculator {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly providers: ProviderRepository,
  ) {}

  async recalculate(providerId: string): Promise<void> {
    await this.reviews.lockProvider(providerId);
    const { average, count } = await this.reviews.aggregateVisible(providerId);
    await this.providers.setRating(providerId, roundRating(average), count);
  }
}

/** The booking's customer reviews a COMPLETED booking once, within 30 days of completion. */
@Injectable()
export class CreateReviewUseCase {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly bookings: BookingRepository,
    private readonly ratings: RatingRecalculator,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(
    user: AuthenticatedUser,
    bookingId: string,
    input: Ratings & { comment: string | null },
  ): Promise<ReviewView> {
    const now = this.clock.now();
    const booking = await this.bookings.findById(bookingId);
    if (!booking?.isCustomer(user.id)) throw new BookingNotFoundError();
    if (booking.status !== BookingStatus.COMPLETED || !booking.completedAt) {
      throw new BookingNotReviewableError('NOT_COMPLETED');
    }
    if (now.getTime() - booking.completedAt.getTime() > REVIEW_WINDOW_DAYS * 86_400_000) {
      throw new BookingNotReviewableError('WINDOW_CLOSED');
    }
    const review = await this.uow.run(async () => {
      const created = await this.reviews.create({
        ...input,
        bookingId,
        customerId: user.id,
        providerId: booking.providerId,
      });
      await this.ratings.recalculate(booking.providerId);
      return created;
    });
    const data = {
      reviewId: review.id,
      bookingId,
      providerId: booking.providerId,
      providerUserId: booking.providerUserId,
      overall: review.overall,
    };
    await this.events.publish(new ReviewCreatedEvent(data, now));
    return this.view(review.id);
  }

  private async view(id: string): Promise<ReviewView> {
    const view = await this.reviews.findView(id);
    if (!view) throw new ReviewNotFoundError();
    return view;
  }
}

/** Public: visible reviews of a verified provider, newest first. */
@Injectable()
export class ListProviderReviewsUseCase {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly providers: ProviderRepository,
  ) {}

  async execute(providerId: string, page: PageRequest): Promise<PaginatedResult<ReviewView>> {
    const provider = await this.providers.findById(providerId);
    if (provider?.verificationStatus !== VerificationStatus.VERIFIED)
      throw new ProviderNotFoundError();
    return this.reviews.listVisibleForProvider(providerId, page);
  }
}

@Injectable()
export class ListReviewsForModerationUseCase {
  constructor(private readonly reviews: ReviewRepository) {}

  execute(filter: ReviewModerationFilter, page: PageRequest): Promise<PaginatedResult<ReviewView>> {
    return this.reviews.listForModeration(filter, page);
  }
}

/** Admin soft-hides a review; the provider's rating is recalculated in the same transaction. */
@Injectable()
export class HideReviewUseCase {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly ratings: RatingRecalculator,
    private readonly audit: AuditTrail,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  execute(actor: Actor, reviewId: string, reason: string): Promise<ReviewView> {
    return this.uow.run(async () => {
      const review = await this.reviews.findById(reviewId);
      if (!review) throw new ReviewNotFoundError();
      if (review.hiddenAt) throw new ReviewAlreadyHiddenError();
      const hidden = await this.reviews.hide(reviewId, actor.id, reason, this.clock.now());
      await this.ratings.recalculate(review.providerId);
      await this.audit.record({
        actor,
        action: 'review.hidden',
        entityType: 'Review',
        entityId: reviewId,
        before: { hiddenAt: null },
        after: { hiddenAt: hidden.hiddenAt, reason },
      });
      const view = await this.reviews.findView(reviewId);
      if (!view) throw new ReviewNotFoundError();
      return view;
    });
  }
}
