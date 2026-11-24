import { DomainError } from '../../../common/errors/domain-error.js';

export class QuotationNotFoundError extends DomainError {
  readonly code = 'QUOTATION_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Quotation not found');
  }
}

export class InvalidQuotationStateError extends DomainError {
  readonly code = 'QUOTATION_INVALID_STATE';
  readonly kind = 'CONFLICT';
  constructor(status: string, action: string) {
    super(`Cannot ${action} a ${status} quotation`, { status, action });
  }
}

export class QuotationExpiredError extends DomainError {
  readonly code = 'QUOTATION_EXPIRED';
  readonly kind = 'BUSINESS_RULE';
  constructor() {
    super('This quotation has expired');
  }
}

export class QuotationAlreadyOpenError extends DomainError {
  readonly code = 'QUOTATION_ALREADY_OPEN';
  readonly kind = 'CONFLICT';
  constructor() {
    super('This booking already has a draft or sent quotation');
  }
}

export class BookingNotQuotableError extends DomainError {
  readonly code = 'BOOKING_NOT_QUOTABLE';
  readonly kind = 'CONFLICT';
  constructor(status: string) {
    super(`Quotations are only possible while a booking is PENDING or ACCEPTED (it is ${status})`, {
      status,
    });
  }
}

export class ConcurrentQuotationUpdateError extends DomainError {
  readonly code = 'QUOTATION_CONCURRENT_UPDATE';
  readonly kind = 'CONFLICT';
  constructor() {
    super('The quotation was changed meanwhile; reload and retry');
  }
}
