import { describe, expect, it } from 'vitest';
import { aBooking } from '../../../../test/unit/fixtures/bookings.js';
import { BookingRuleError, BookingTransitionForbiddenError } from './bookings.errors.js';

const at = new Date('2030-01-07T05:00:00Z');
const provider = { id: 'user-p1', role: 'PROVIDER' as const };
const customer = { id: 'cust-1', role: 'CUSTOMER' as const };

describe('Booking', () => {
  it('identifies its parties', () => {
    const booking = aBooking();
    expect(booking.isCustomer('cust-1')).toBe(true);
    expect(booking.isProvider('user-p1')).toBe(true);
    expect(booking.isProvider('cust-1')).toBe(false);
  });

  it('stamps acceptance and returns the history row', () => {
    const { booking, change } = aBooking().transition('ACCEPTED', provider, at);
    expect(booking).toMatchObject({ status: 'ACCEPTED', acceptedAt: at });
    expect(change).toEqual({
      bookingId: 'bk-1',
      from: 'PENDING',
      to: 'ACCEPTED',
      actorId: 'user-p1',
      actorRole: 'PROVIDER',
      note: null,
      at,
    });
  });

  it('records reasons for rejection and cancellation', () => {
    expect(
      aBooking().transition('REJECTED', provider, at, { reason: 'Busy' }).booking.rejectionReason,
    ).toBe('Busy');
    const cancelled = aBooking().transition('CANCELLED', customer, at, { reason: 'Changed plans' });
    expect(cancelled.booking).toMatchObject({ cancelledAt: at, cancelReason: 'Changed plans' });
    expect(cancelled.change.note).toBe('Changed plans');
    expect(aBooking().transition('CANCELLED', customer, at).booking.cancelReason).toBeNull();
  });

  it('stamps the start and requires a final amount to complete', () => {
    expect(
      aBooking({ status: 'ON_THE_WAY' }).transition('IN_PROGRESS', provider, at).booking.startedAt,
    ).toEqual(at);
    const inProgress = aBooking({ status: 'IN_PROGRESS' });
    expect(() => inProgress.transition('COMPLETED', provider, at)).toThrow(BookingRuleError);
    expect(
      inProgress.transition('COMPLETED', provider, at, { finalAmount: 1800 }).booking,
    ).toMatchObject({
      status: 'COMPLETED',
      completedAt: at,
      finalAmount: 1800,
    });
  });

  it('requires an amount when a dispute raised mid-job is closed as completed', () => {
    const disputed = aBooking({ status: 'DISPUTED' });
    const admin = { id: 'adm', role: 'ADMIN' as const };
    expect(() => disputed.transition('COMPLETED', admin, at)).toThrow(BookingRuleError);
    expect(disputed.transition('COMPLETED', admin, at, { finalAmount: 900 }).booking).toMatchObject(
      {
        completedAt: at,
        finalAmount: 900,
      },
    );
  });

  it('lets an admin close a dispute as completed without changing the amount', () => {
    const disputed = aBooking({ status: 'DISPUTED', finalAmount: 1800, completedAt: at });
    const { booking } = disputed.transition('COMPLETED', { id: 'adm', role: 'ADMIN' }, new Date());
    expect(booking).toMatchObject({ status: 'COMPLETED', finalAmount: 1800, completedAt: at });
  });

  it('refuses a customer completing a job', () => {
    expect(() =>
      aBooking({ status: 'IN_PROGRESS' }).transition('COMPLETED', customer, at, { finalAmount: 1 }),
    ).toThrow(BookingTransitionForbiddenError);
  });

  it('reveals contact details only from acceptance onwards', () => {
    expect(aBooking({ status: 'PENDING' }).contactVisible).toBe(false);
    expect(aBooking({ status: 'REJECTED' }).contactVisible).toBe(false);
    expect(aBooking({ status: 'CANCELLED' }).contactVisible).toBe(false);
    for (const status of [
      'ACCEPTED',
      'ON_THE_WAY',
      'IN_PROGRESS',
      'COMPLETED',
      'DISPUTED',
    ] as const) {
      expect(aBooking({ status }).contactVisible).toBe(true);
    }
  });

  it('sets an estimated amount immutably', () => {
    const original = aBooking();
    expect(original.withEstimatedAmount(2500).estimatedAmount).toBe(2500);
    expect(original.estimatedAmount).toBeNull();
  });
});
