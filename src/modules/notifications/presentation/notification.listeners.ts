import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BookingCreatedEvent,
  BookingStatusChangedEvent,
} from '../../bookings/domain/booking.events.js';
import { DisputeOpenedEvent, DisputeResolvedEvent } from '../../disputes/domain/dispute.js';
import {
  ProviderRejectedEvent,
  ProviderSuspendedEvent,
  ProviderVerifiedEvent,
} from '../../providers/domain/provider.events.js';
import {
  QuotationRespondedEvent,
  QuotationSentEvent,
} from '../../quotations/domain/quotation.events.js';
import { ReviewCreatedEvent } from '../../reviews/domain/review.js';
import * as messages from '../application/notification-messages.js';
import { DispatchNotificationsUseCase } from '../application/notifications.use-cases.js';

/** Inbound adapter: domain events → in-app notifications. */
@Injectable()
export class NotificationListeners {
  constructor(private readonly dispatch: DispatchNotificationsUseCase) {}

  @OnEvent(BookingCreatedEvent.NAME, { promisify: true })
  onBookingCreated(event: BookingCreatedEvent): Promise<void> {
    return this.dispatch.execute(messages.bookingCreated(event));
  }

  @OnEvent(BookingStatusChangedEvent.NAME, { promisify: true })
  onBookingStatusChanged(event: BookingStatusChangedEvent): Promise<void> {
    return this.dispatch.execute(messages.bookingStatusChanged(event));
  }

  @OnEvent(QuotationSentEvent.NAME, { promisify: true })
  onQuotationSent(event: QuotationSentEvent): Promise<void> {
    return this.dispatch.execute(messages.quotationSent(event));
  }

  @OnEvent(QuotationRespondedEvent.NAME, { promisify: true })
  onQuotationResponded(event: QuotationRespondedEvent): Promise<void> {
    return this.dispatch.execute(messages.quotationResponded(event));
  }

  @OnEvent(ReviewCreatedEvent.NAME, { promisify: true })
  onReviewCreated(event: ReviewCreatedEvent): Promise<void> {
    return this.dispatch.execute(messages.reviewReceived(event));
  }

  @OnEvent(ProviderVerifiedEvent.NAME, { promisify: true })
  onProviderVerified(event: ProviderVerifiedEvent): Promise<void> {
    return this.dispatch.execute(messages.providerVerified(event));
  }

  @OnEvent(ProviderRejectedEvent.NAME, { promisify: true })
  onProviderRejected(event: ProviderRejectedEvent): Promise<void> {
    return this.dispatch.execute(messages.providerRejected(event));
  }

  @OnEvent(ProviderSuspendedEvent.NAME, { promisify: true })
  onProviderSuspended(event: ProviderSuspendedEvent): Promise<void> {
    return this.dispatch.execute(messages.providerSuspended(event));
  }

  @OnEvent(DisputeOpenedEvent.NAME, { promisify: true })
  onDisputeOpened(event: DisputeOpenedEvent): Promise<void> {
    return this.dispatch.execute(messages.disputeOpened(event));
  }

  @OnEvent(DisputeResolvedEvent.NAME, { promisify: true })
  onDisputeResolved(event: DisputeResolvedEvent): Promise<void> {
    return this.dispatch.execute(messages.disputeResolved(event));
  }
}
