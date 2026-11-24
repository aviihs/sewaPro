import { DomainError } from '../../../common/errors/domain-error.js';

export class ReviewNotFoundError extends DomainError {
  readonly code = 'REVIEW_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Review not found');
  }
}

export class ReviewAlreadyExistsError extends DomainError {
  readonly code = 'REVIEW_ALREADY_EXISTS';
  readonly kind = 'CONFLICT';
  constructor() {
    super('This booking has already been reviewed');
  }
}

export class BookingNotReviewableError extends DomainError {
  readonly code = 'BOOKING_NOT_REVIEWABLE';
  readonly kind = 'BUSINESS_RULE';
  constructor(reason: 'NOT_COMPLETED' | 'WINDOW_CLOSED') {
    super(
      reason === 'NOT_COMPLETED'
        ? 'Only completed bookings can be reviewed'
        : 'The review window for this booking has closed',
      { reason },
    );
  }
}

export class ReviewAlreadyHiddenError extends DomainError {
  readonly code = 'REVIEW_ALREADY_HIDDEN';
  readonly kind = 'CONFLICT';
  constructor() {
    super('This review is already hidden');
  }
}
