import { toNepalTime } from '../../../common/time/nepal-time.js';
import {
  type BookingCreatedEvent,
  type BookingStatusChangedEvent,
} from '../../bookings/domain/booking.events.js';
import {
  type ProviderRejectedEvent,
  type ProviderSuspendedEvent,
  type ProviderVerifiedEvent,
} from '../../providers/domain/provider.events.js';
import {
  type QuotationRespondedEvent,
  type QuotationSentEvent,
} from '../../quotations/domain/quotation.events.js';
import {
  type DisputeOpenedEvent,
  type DisputeResolvedEvent,
} from '../../disputes/domain/dispute.js';
import { type ReviewCreatedEvent } from '../../reviews/domain/review.js';
import { type NotificationDraft, NotificationType } from '../domain/notification.js';

/** "2030-01-07 10:00 NPT" */
export function nepalLabel(instant: Date): string {
  const { date, minuteOfDay } = toNepalTime(instant);
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const mm = String(minuteOfDay % 60).padStart(2, '0');
  return `${date} ${hh}:${mm} NPT`;
}

const npr = (amount: number): string => `NPR ${amount.toFixed(2)}`;

export function bookingCreated({ data }: BookingCreatedEvent): NotificationDraft[] {
  return [
    {
      userId: data.providerUserId,
      type: NotificationType.BOOKING_CREATED,
      title: 'New booking request',
      body: `You have a new booking request for ${nepalLabel(data.scheduledAt)}. Accept or reject it.`,
      data: { bookingId: data.bookingId },
    },
  ];
}

/** Customer hears about every provider/system move; provider hears about cancellations. */
export function bookingStatusChanged({ data }: BookingStatusChangedEvent): NotificationDraft[] {
  const ref = { bookingId: data.bookingId };
  const toCustomer = (type: NotificationType, title: string, body: string): NotificationDraft => ({
    userId: data.customerId,
    type,
    title,
    body,
    data: ref,
  });
  switch (data.to) {
    case 'ACCEPTED':
      return [
        toCustomer(
          NotificationType.BOOKING_ACCEPTED,
          'Booking accepted',
          'Your provider accepted the booking.',
        ),
      ];
    case 'REJECTED':
      return [
        toCustomer(
          NotificationType.BOOKING_REJECTED,
          'Booking declined',
          data.reason ?? 'The provider cannot take this booking.',
        ),
      ];
    case 'ON_THE_WAY':
      return [
        toCustomer(
          NotificationType.BOOKING_STATUS_CHANGED,
          'Provider on the way',
          'Your provider is on the way.',
        ),
      ];
    case 'IN_PROGRESS':
      return [
        toCustomer(
          NotificationType.BOOKING_STATUS_CHANGED,
          'Work started',
          'Your provider has started the job.',
        ),
      ];
    case 'COMPLETED': {
      const amount = data.finalAmount === null ? '' : ` Final amount: ${npr(data.finalAmount)}.`;
      return [
        toCustomer(
          NotificationType.BOOKING_COMPLETED,
          'Job completed',
          `The job is complete.${amount} Please leave a review.`,
        ),
      ];
    }
    case 'CANCELLED': {
      const cancel = (userId: string): NotificationDraft => ({
        userId,
        type: NotificationType.BOOKING_CANCELLED,
        title: 'Booking cancelled',
        body: data.reason ?? 'The booking was cancelled.',
        data: ref,
      });
      if (data.actorRole === 'CUSTOMER') return [cancel(data.providerUserId)];
      return [cancel(data.customerId), cancel(data.providerUserId)];
    }
    default:
      return [];
  }
}

export const quotationSent = ({ data }: QuotationSentEvent): NotificationDraft[] => [
  {
    userId: data.customerId,
    type: NotificationType.QUOTATION_SENT,
    title: 'New quotation',
    body: `Your provider quoted ${npr(data.total)}, valid until ${nepalLabel(data.expiresAt)}.`,
    data: { bookingId: data.bookingId, quotationId: data.quotationId },
  },
];

export const quotationResponded = ({ data }: QuotationRespondedEvent): NotificationDraft[] => [
  {
    userId: data.providerUserId,
    type: NotificationType.QUOTATION_RESPONDED,
    title: data.accepted ? 'Quotation accepted' : 'Quotation declined',
    body: `The customer ${data.accepted ? 'accepted' : 'declined'} your quotation of ${npr(data.total)}.`,
    data: { bookingId: data.bookingId, quotationId: data.quotationId },
  },
];

export const reviewReceived = ({ data }: ReviewCreatedEvent): NotificationDraft[] => [
  {
    userId: data.providerUserId,
    type: NotificationType.REVIEW_RECEIVED,
    title: 'New review',
    body: `A customer rated your work ${data.overall}/5.`,
    data: { bookingId: data.bookingId, reviewId: data.reviewId },
  },
];

export const providerVerified = ({ data }: ProviderVerifiedEvent): NotificationDraft[] => [
  {
    userId: data.userId,
    type: NotificationType.PROVIDER_VERIFIED,
    title: 'You are verified',
    body: 'Your profile is live. Customers can now find and book you.',
    data: { providerId: data.providerId },
  },
];

export const providerRejected = ({ data }: ProviderRejectedEvent): NotificationDraft[] => [
  {
    userId: data.userId,
    type: NotificationType.PROVIDER_REJECTED,
    title: 'Verification not approved',
    body: `${data.reason} Upload new documents and resubmit.`,
    data: { providerId: data.providerId },
  },
];

export const providerSuspended = ({ data }: ProviderSuspendedEvent): NotificationDraft[] => [
  {
    userId: data.userId,
    type: NotificationType.PROVIDER_SUSPENDED,
    title: 'Profile suspended',
    body: data.reason,
    data: { providerId: data.providerId },
  },
];

/** The other party learns a dispute was opened. */
export function disputeOpened({ data }: DisputeOpenedEvent): NotificationDraft[] {
  const userId = data.raisedByRole === 'CUSTOMER' ? data.providerUserId : data.customerId;
  return [
    {
      userId,
      type: NotificationType.DISPUTE_OPENED,
      title: 'Dispute opened',
      body: `A dispute was opened on your booking: ${data.reason}`,
      data: { bookingId: data.bookingId, disputeId: data.disputeId },
    },
  ];
}

export function disputeResolved({ data }: DisputeResolvedEvent): NotificationDraft[] {
  const outcome =
    data.outcome === 'BOOKING_COMPLETED'
      ? 'the booking stands as completed'
      : 'the booking is cancelled';
  return [data.customerId, data.providerUserId].map((userId) => ({
    userId,
    type: NotificationType.DISPUTE_RESOLVED,
    title: 'Dispute resolved',
    body: `Decision: ${outcome}. ${data.resolution}`,
    data: { bookingId: data.bookingId, disputeId: data.disputeId },
  }));
}
