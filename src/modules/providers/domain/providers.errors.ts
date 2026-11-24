import { DomainError } from '../../../common/errors/domain-error.js';

export class ProviderNotFoundError extends DomainError {
  readonly code = 'PROVIDER_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Provider not found');
  }
}

export class InvalidVerificationTransitionError extends DomainError {
  readonly code = 'INVALID_VERIFICATION_TRANSITION';
  readonly kind = 'CONFLICT';
  constructor(status: string, action: string) {
    super(`Cannot ${action} a provider whose status is ${status}`, { status, action });
  }
}

export class DocumentsRequiredError extends DomainError {
  readonly code = 'PROVIDER_DOCUMENTS_REQUIRED';
  readonly kind = 'BUSINESS_RULE';
  constructor() {
    super('At least one new verification document must be uploaded first');
  }
}

export class InvalidPricingError extends DomainError {
  readonly code = 'INVALID_PRICING';
  readonly kind = 'VALIDATION';
  constructor(pricingType: string, message: string) {
    super(message, { pricingType });
  }
}

export class ServiceUnavailableForOfferingError extends DomainError {
  readonly code = 'SERVICE_NOT_OFFERABLE';
  readonly kind = 'BUSINESS_RULE';
  constructor() {
    super('This service does not exist or is not active');
  }
}

export class OfferingNotFoundError extends DomainError {
  readonly code = 'OFFERING_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('You do not offer this service');
  }
}

export class DocumentNotFoundError extends DomainError {
  readonly code = 'DOCUMENT_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Document not found');
  }
}

export class DocumentLockedError extends DomainError {
  readonly code = 'DOCUMENT_LOCKED';
  readonly kind = 'CONFLICT';
  constructor() {
    super('Reviewed documents cannot be deleted');
  }
}

export class UploadNotAllowedError extends DomainError {
  readonly code = 'UPLOAD_NOT_ALLOWED';
  readonly kind = 'BUSINESS_RULE';
  constructor(message: string, limit?: number) {
    super(message, limit === undefined ? undefined : { limit });
  }
}

export class PortfolioImageNotFoundError extends DomainError {
  readonly code = 'PORTFOLIO_IMAGE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Portfolio image not found');
  }
}

export class AvailabilityOverlapError extends DomainError {
  readonly code = 'AVAILABILITY_OVERLAP';
  readonly kind = 'VALIDATION';
  constructor(dayOfWeek: number) {
    super('Availability windows on the same day must not overlap', { dayOfWeek });
  }
}

export class BlockedDateConflictError extends DomainError {
  readonly code = 'BLOCKED_DATE_EXISTS';
  readonly kind = 'CONFLICT';
  constructor() {
    super('This date is already blocked');
  }
}

export class BlockedDateInPastError extends DomainError {
  readonly code = 'BLOCKED_DATE_OUT_OF_RANGE';
  readonly kind = 'BUSINESS_RULE';
  constructor(maxDaysAhead: number) {
    super(`Only dates from today up to ${maxDaysAhead} days ahead can be blocked`, {
      maxDaysAhead,
    });
  }
}

export class BlockedDateNotFoundError extends DomainError {
  readonly code = 'BLOCKED_DATE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Blocked date not found');
  }
}

export class InvalidAvailabilityWindowError extends DomainError {
  readonly code = 'INVALID_AVAILABILITY_WINDOW';
  readonly kind = 'VALIDATION';
  constructor(dayOfWeek: number) {
    super('Each availability window must end after it starts', { dayOfWeek });
  }
}

export class InvalidCalendarDateError extends DomainError {
  readonly code = 'INVALID_DATE';
  readonly kind = 'VALIDATION';
  constructor(date: string) {
    super(`${date} is not a valid calendar date`, { date });
  }
}
