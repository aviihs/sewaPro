import { DomainError } from '../../../common/errors/domain-error.js';

export class DisputeNotFoundError extends DomainError {
  readonly code = 'DISPUTE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Dispute not found');
  }
}

export class DisputeAlreadyOpenError extends DomainError {
  readonly code = 'DISPUTE_ALREADY_OPEN';
  readonly kind = 'CONFLICT';
  constructor() {
    super('This booking already has an unresolved dispute');
  }
}

export class InvalidDisputeStateError extends DomainError {
  readonly code = 'DISPUTE_INVALID_STATE';
  readonly kind = 'CONFLICT';
  constructor(status: string, action: string) {
    super(`Cannot ${action} a ${status} dispute`, { status, action });
  }
}

export class BookingNotDisputableError extends DomainError {
  readonly code = 'BOOKING_NOT_DISPUTABLE';
  readonly kind = 'BUSINESS_RULE';
  constructor(reason: 'STATUS' | 'WINDOW_CLOSED') {
    super(
      reason === 'STATUS'
        ? 'Only bookings in progress or completed can be disputed'
        : 'The dispute window for this booking has closed',
      { reason },
    );
  }
}

export class ConcurrentDisputeUpdateError extends DomainError {
  readonly code = 'DISPUTE_CONCURRENT_UPDATE';
  readonly kind = 'CONFLICT';
  constructor() {
    super('The dispute was changed meanwhile; reload and retry');
  }
}
