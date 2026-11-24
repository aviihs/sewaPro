import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingStatusChangedEvent } from '../../bookings/domain/booking.events.js';
import { DisputeOpenedEvent } from '../../disputes/domain/dispute.js';
import { QuotationRespondedEvent } from '../../quotations/domain/quotation.events.js';
import {
  RecordAuditUseCase,
  bookingAudit,
  disputeAudit,
  quotationAudit,
} from '../application/audit.use-cases.js';

/** Inbound adapter: sensitive domain events → audit log rows. */
@Injectable()
export class AuditListeners {
  constructor(private readonly record: RecordAuditUseCase) {}

  @OnEvent(BookingStatusChangedEvent.NAME, { promisify: true })
  onBookingStatusChanged(event: BookingStatusChangedEvent): Promise<void> {
    return this.record.execute(bookingAudit(event));
  }

  @OnEvent(DisputeOpenedEvent.NAME, { promisify: true })
  onDisputeOpened(event: DisputeOpenedEvent): Promise<void> {
    return this.record.execute(disputeAudit(event));
  }

  @OnEvent(QuotationRespondedEvent.NAME, { promisify: true })
  onQuotationResponded(event: QuotationRespondedEvent): Promise<void> {
    return this.record.execute(quotationAudit(event));
  }
}
