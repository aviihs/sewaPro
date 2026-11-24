import { describe, expect, it } from 'vitest';
import {
  BookingCreatedEvent,
  BookingStatusChangedEvent,
} from '../../bookings/domain/booking.events.js';
import { type BookingStatus } from '../../bookings/domain/booking-state-machine.js';
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
import * as messages from './notification-messages.js';

const at = new Date('2030-01-07T04:15:00Z');
const parties = {
  bookingId: 'bk-1',
  customerId: 'cust-1',
  providerId: 'prov-1',
  providerUserId: 'user-p1',
};
const changed = (
  to: BookingStatus,
  actorRole: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' = 'PROVIDER',
  extra = {},
) =>
  new BookingStatusChangedEvent(
    {
      ...parties,
      from: 'PENDING',
      to,
      actorId: 'x',
      actorRole,
      reason: null,
      finalAmount: null,
      ...extra,
    },
    at,
  );
const recipients = (drafts: { userId: string; type: string }[]) =>
  drafts.map((d) => `${d.userId}:${d.type}`);

describe('notification messages', () => {
  it('formats Nepal time labels', () => {
    expect(messages.nepalLabel(at)).toBe('2030-01-07 10:00 NPT');
  });

  it('tells the provider about new bookings', () => {
    const [draft] = messages.bookingCreated(
      new BookingCreatedEvent({ ...parties, scheduledAt: at }, at),
    );
    expect(draft).toMatchObject({
      userId: 'user-p1',
      type: 'BOOKING_CREATED',
      data: { bookingId: 'bk-1' },
    });
    expect(draft.body).toContain('2030-01-07 10:00 NPT');
  });

  it('tells the customer about provider moves', () => {
    expect(recipients(messages.bookingStatusChanged(changed('ACCEPTED')))).toEqual([
      'cust-1:BOOKING_ACCEPTED',
    ]);
    expect(
      recipients(
        messages.bookingStatusChanged(changed('REJECTED', 'PROVIDER', { reason: 'Busy' })),
      ),
    ).toEqual(['cust-1:BOOKING_REJECTED']);
    expect(messages.bookingStatusChanged(changed('REJECTED'))[0]?.body).toContain('cannot take');
    expect(recipients(messages.bookingStatusChanged(changed('ON_THE_WAY')))).toEqual([
      'cust-1:BOOKING_STATUS_CHANGED',
    ]);
    expect(recipients(messages.bookingStatusChanged(changed('IN_PROGRESS')))).toEqual([
      'cust-1:BOOKING_STATUS_CHANGED',
    ]);
    const done = messages.bookingStatusChanged(
      changed('COMPLETED', 'PROVIDER', { finalAmount: 1750.5 }),
    );
    expect(done[0]?.body).toContain('NPR 1750.50');
    expect(messages.bookingStatusChanged(changed('COMPLETED'))[0]?.body).not.toContain('NPR');
    expect(messages.bookingStatusChanged(changed('DISPUTED'))).toEqual([]);
  });

  it('routes cancellations to the other party, or both when an admin cancels', () => {
    expect(recipients(messages.bookingStatusChanged(changed('CANCELLED', 'CUSTOMER')))).toEqual([
      'user-p1:BOOKING_CANCELLED',
    ]);
    expect(
      recipients(
        messages.bookingStatusChanged(changed('CANCELLED', 'ADMIN', { reason: 'Resolved' })),
      ),
    ).toEqual(['cust-1:BOOKING_CANCELLED', 'user-p1:BOOKING_CANCELLED']);
  });

  it('covers quotations, reviews, verification and disputes', () => {
    const quote = {
      quotationId: 'q-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      providerUserId: 'user-p1',
      total: 2000,
    };
    expect(
      recipients(messages.quotationSent(new QuotationSentEvent({ ...quote, expiresAt: at }, at))),
    ).toEqual(['cust-1:QUOTATION_SENT']);
    expect(
      messages.quotationResponded(new QuotationRespondedEvent({ ...quote, accepted: true }, at))[0]
        ?.title,
    ).toBe('Quotation accepted');
    expect(
      messages.quotationResponded(new QuotationRespondedEvent({ ...quote, accepted: false }, at))[0]
        ?.title,
    ).toBe('Quotation declined');
    const review = new ReviewCreatedEvent(
      { reviewId: 'r', bookingId: 'bk-1', providerId: 'p', providerUserId: 'user-p1', overall: 4 },
      at,
    );
    expect(recipients(messages.reviewReceived(review))).toEqual(['user-p1:REVIEW_RECEIVED']);

    const provider = { providerId: 'prov-1', userId: 'user-p1' };
    expect(messages.providerVerified(new ProviderVerifiedEvent(provider, at))[0]?.type).toBe(
      'PROVIDER_VERIFIED',
    );
    expect(
      messages.providerRejected(
        new ProviderRejectedEvent({ ...provider, reason: 'Blurry.' }, at),
      )[0]?.body,
    ).toContain('Blurry.');
    expect(
      messages.providerSuspended(
        new ProviderSuspendedEvent({ ...provider, reason: 'Complaints' }, at),
      )[0]?.body,
    ).toBe('Complaints');

    const dispute = {
      disputeId: 'd-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      providerUserId: 'user-p1',
    };
    expect(
      recipients(
        messages.disputeOpened(
          new DisputeOpenedEvent({ ...dispute, raisedByRole: 'CUSTOMER', reason: 'x' }, at),
        ),
      ),
    ).toEqual(['user-p1:DISPUTE_OPENED']);
    expect(
      recipients(
        messages.disputeOpened(
          new DisputeOpenedEvent({ ...dispute, raisedByRole: 'PROVIDER', reason: 'x' }, at),
        ),
      ),
    ).toEqual(['cust-1:DISPUTE_OPENED']);
    const resolved = messages.disputeResolved(
      new DisputeResolvedEvent(
        { ...dispute, outcome: 'BOOKING_CANCELLED', resolution: 'Refund agreed.' },
        at,
      ),
    );
    expect(recipients(resolved)).toEqual(['cust-1:DISPUTE_RESOLVED', 'user-p1:DISPUTE_RESOLVED']);
    expect(resolved[0]?.body).toContain('cancelled');
    expect(
      messages.disputeResolved(
        new DisputeResolvedEvent(
          { ...dispute, outcome: 'BOOKING_COMPLETED', resolution: 'Ok.' },
          at,
        ),
      )[0]?.body,
    ).toContain('completed');
  });
});
