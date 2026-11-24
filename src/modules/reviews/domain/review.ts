import { type DomainEvent } from '../../../common/ports/domain-events.port.js';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';

export const REVIEW_WINDOW_DAYS = 30;

export interface Ratings {
  readonly overall: number;
  readonly serviceQuality: number;
  readonly professionalism: number;
  readonly punctuality: number;
  readonly communication: number;
}

export interface Review extends Ratings {
  readonly id: string;
  readonly bookingId: string;
  readonly customerId: string;
  readonly providerId: string;
  readonly comment: string | null;
  readonly hiddenAt: Date | null;
  readonly hiddenReason: string | null;
  readonly createdAt: Date;
}

/** Public/admin listing row: the review plus a display name for its author. */
export interface ReviewView {
  readonly review: Review;
  readonly customerName: string;
}

export interface NewReview extends Ratings {
  readonly bookingId: string;
  readonly customerId: string;
  readonly providerId: string;
  readonly comment: string | null;
}

export interface RatingAggregate {
  readonly average: number;
  readonly count: number;
}

export interface ReviewModerationFilter {
  readonly hidden?: boolean;
  readonly providerId?: string;
  readonly maxOverall?: number;
}

/** "Aarati Sharma" → "Aarati S." so public reviews do not expose full names. */
export function publicName(fullName: string): string {
  const [first = '', ...rest] = fullName.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

/** Average of visible overall ratings, rounded to 2 decimals (column is DECIMAL(3,2)). */
export const roundRating = (average: number): number => Math.round(average * 100) / 100;

export abstract class ReviewRepository {
  /** @throws ReviewAlreadyExistsError if the booking already has a review. */
  abstract create(review: NewReview): Promise<Review>;
  abstract findById(id: string): Promise<Review | null>;
  abstract findView(id: string): Promise<ReviewView | null>;
  abstract hide(id: string, by: string, reason: string, at: Date): Promise<Review>;
  /** Serializes rating recomputation for one provider within the current transaction. */
  abstract lockProvider(providerId: string): Promise<void>;
  /** Aggregate over visible (not hidden) reviews. */
  abstract aggregateVisible(providerId: string): Promise<RatingAggregate>;
  abstract listVisibleForProvider(
    providerId: string,
    page: PageRequest,
  ): Promise<PaginatedResult<ReviewView>>;
  abstract listForModeration(
    filter: ReviewModerationFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<ReviewView>>;
}

export class ReviewCreatedEvent implements DomainEvent {
  static readonly NAME = 'review.created';
  readonly name = ReviewCreatedEvent.NAME;
  constructor(
    readonly data: {
      readonly reviewId: string;
      readonly bookingId: string;
      readonly providerId: string;
      readonly providerUserId: string;
      readonly overall: number;
    },
    readonly occurredAt: Date,
  ) {}
}
