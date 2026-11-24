import { describe, expect, it } from 'vitest';
import { aProvider } from '../../../../test/unit/fixtures/providers.js';
import { assertValidSchedule, fitsAvailability } from './availability.js';
import { validatePricing } from './offering.js';
import {
  AvailabilityOverlapError,
  InvalidAvailabilityWindowError,
  InvalidPricingError,
  InvalidVerificationTransitionError,
} from './providers.errors.js';

const at = new Date('2030-01-01T00:00:00Z');

describe('Provider verification lifecycle', () => {
  it('verifies pending providers and reinstates suspended ones', () => {
    const verified = aProvider().verify(at);
    expect(verified).toMatchObject({
      verificationStatus: 'VERIFIED',
      verifiedAt: at,
      rejectionReason: null,
    });
    expect(verified.isBookable).toBe(true);
    expect(verified.suspend().verify(at).verificationStatus).toBe('VERIFIED');
  });

  it('rejects with a reason and allows resubmission', () => {
    const rejected = aProvider().reject('Blurry citizenship photo');
    expect(rejected).toMatchObject({
      verificationStatus: 'REJECTED',
      rejectionReason: 'Blurry citizenship photo',
    });
    expect(rejected.resubmit(at)).toMatchObject({
      verificationStatus: 'PENDING_VERIFICATION',
      rejectionReason: null,
      submittedAt: at,
    });
  });

  const illegal: [string, () => unknown][] = [
    ['verify a rejected provider', () => aProvider({ verificationStatus: 'REJECTED' }).verify(at)],
    ['verify a verified provider', () => aProvider({ verificationStatus: 'VERIFIED' }).verify(at)],
    ['reject a verified provider', () => aProvider({ verificationStatus: 'VERIFIED' }).reject('x')],
    ['suspend a pending provider', () => aProvider().suspend()],
    ['resubmit a pending provider', () => aProvider().resubmit(at)],
  ];

  it.each(illegal)('refuses to %s', (_label, act) => {
    expect(act).toThrow(InvalidVerificationTransitionError);
  });

  it('is bookable only when verified and available', () => {
    expect(aProvider().isBookable).toBe(false);
    expect(aProvider({ verificationStatus: 'VERIFIED', isAvailable: false }).isBookable).toBe(
      false,
    );
  });
});

describe('validatePricing', () => {
  it('requires a positive price except for quotations', () => {
    expect(() => {
      validatePricing('FIXED', 500);
    }).not.toThrow();
    expect(() => {
      validatePricing('QUOTATION', null);
    }).not.toThrow();
    expect(() => {
      validatePricing('QUOTATION', 100);
    }).toThrow(InvalidPricingError);
    expect(() => {
      validatePricing('HOURLY', null);
    }).toThrow(InvalidPricingError);
    expect(() => {
      validatePricing('STARTING_FROM', 0);
    }).toThrow(InvalidPricingError);
  });
});

describe('availability', () => {
  const windows = [
    { dayOfWeek: 0, startMinute: 540, endMinute: 720 },
    { dayOfWeek: 0, startMinute: 780, endMinute: 1080 },
  ];

  it('accepts touching windows and rejects overlaps on the same day', () => {
    expect(() => {
      assertValidSchedule([...windows, { dayOfWeek: 1, startMinute: 600, endMinute: 700 }]);
    }).not.toThrow();
    expect(() => {
      assertValidSchedule([
        { dayOfWeek: 2, startMinute: 0, endMinute: 60 },
        { dayOfWeek: 2, startMinute: 60, endMinute: 90 },
      ]);
    }).not.toThrow();
    expect(() => {
      assertValidSchedule([...windows, { dayOfWeek: 0, startMinute: 700, endMinute: 800 }]);
    }).toThrow(AvailabilityOverlapError);
  });

  it('rejects windows that end before they start', () => {
    expect(() => {
      assertValidSchedule([{ dayOfWeek: 3, startMinute: 600, endMinute: 600 }]);
    }).toThrow(InvalidAvailabilityWindowError);
  });

  it('checks a slot against windows (Nepal time) and blocked dates', () => {
    const sunday9am = new Date('2030-01-06T03:15:00Z');
    expect(fitsAvailability(windows, [], sunday9am, 60)).toBe(true);
    expect(fitsAvailability(windows, [], new Date('2030-01-06T05:45:00Z'), 60)).toBe(false);
    expect(fitsAvailability(windows, ['2030-01-06'], sunday9am, 60)).toBe(false);
    expect(fitsAvailability(windows, [], new Date('2030-01-07T03:15:00Z'), 60)).toBe(false);
  });
});
