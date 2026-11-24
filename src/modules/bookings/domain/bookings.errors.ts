import { DomainError } from '../../../common/errors/domain-error.js';

export class BookingNotFoundError extends DomainError {
  readonly code = 'BOOKING_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Booking not found');
  }
}

export class InvalidBookingTransitionError extends DomainError {
  readonly code = 'BOOKING_INVALID_TRANSITION';
  readonly kind = 'CONFLICT';
  constructor(from: string, to: string) {
    super(`A ${from} booking cannot become ${to}`, { from, to });
  }
}

export class BookingTransitionForbiddenError extends DomainError {
  readonly code = 'BOOKING_TRANSITION_NOT_ALLOWED';
  readonly kind = 'FORBIDDEN';
  constructor(from: string, to: string, actor: string) {
    super(`A ${actor} cannot move a booking from ${from} to ${to}`, { from, to, actor });
  }
}

export class ConcurrentBookingUpdateError extends DomainError {
  readonly code = 'BOOKING_CONCURRENT_UPDATE';
  readonly kind = 'CONFLICT';
  constructor() {
    super('The booking was changed by someone else; reload and retry');
  }
}

/** A business rule blocked the booking; `reason` is a stable sub-code. */
export class BookingRuleError extends DomainError {
  readonly code: string;
  readonly kind = 'BUSINESS_RULE';
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = code;
  }
}

export const BookingRule = {
  providerNotBookable: () =>
    new BookingRuleError('PROVIDER_NOT_BOOKABLE', 'This provider is not accepting bookings'),
  serviceNotOffered: () =>
    new BookingRuleError('SERVICE_NOT_OFFERED', 'The provider does not offer this service'),
  inPast: () =>
    new BookingRuleError('BOOKING_TIME_IN_PAST', 'The booking time must be in the future'),
  tooFar: (days: number) =>
    new BookingRuleError(
      'BOOKING_TIME_TOO_FAR',
      `Bookings can be made at most ${days} days ahead`,
      { days },
    ),
  outsideAvailability: () =>
    new BookingRuleError('OUTSIDE_AVAILABILITY', 'The provider is not working at that time'),
  outOfArea: (distanceKm: number, radiusKm: number) =>
    new BookingRuleError(
      'OUT_OF_SERVICE_AREA',
      'The address is outside the provider service area',
      {
        distanceKm,
        radiusKm,
      },
    ),
  dailyLimit: (max: number) =>
    new BookingRuleError('DAILY_BOOKING_LIMIT_REACHED', 'The provider is fully booked that day', {
      max,
    }),
  finalAmountRequired: () =>
    new BookingRuleError(
      'FINAL_AMOUNT_REQUIRED',
      'A final amount is required to complete the booking',
    ),
} as const;

export class SlotUnavailableError extends DomainError {
  readonly code = 'SLOT_UNAVAILABLE';
  readonly kind = 'CONFLICT';
  constructor() {
    super('The provider already has a booking at that time');
  }
}

export class IdempotencyKeyReusedError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
  readonly kind = 'CONFLICT';
  constructor() {
    super('This Idempotency-Key was already used for a different booking request');
  }
}
