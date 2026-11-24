import { type DomainEvent } from '../../../common/ports/domain-events.port.js';

interface QuotationEventData {
  readonly quotationId: string;
  readonly bookingId: string;
  readonly customerId: string;
  readonly providerUserId: string;
  readonly total: number;
}

export class QuotationSentEvent implements DomainEvent {
  static readonly NAME = 'quotation.sent';
  readonly name = QuotationSentEvent.NAME;
  constructor(
    readonly data: QuotationEventData & { readonly expiresAt: Date },
    readonly occurredAt: Date,
  ) {}
}

export class QuotationRespondedEvent implements DomainEvent {
  static readonly NAME = 'quotation.responded';
  readonly name = QuotationRespondedEvent.NAME;
  constructor(
    readonly data: QuotationEventData & { readonly accepted: boolean },
    readonly occurredAt: Date,
  ) {}
}
