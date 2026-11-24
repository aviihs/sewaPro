import { describe, expect, it } from 'vitest';
import { aQuotation } from '../../../../test/unit/fixtures/quotations.js';
import { draftQuotation } from './quotation.js';
import { InvalidQuotationStateError, QuotationExpiredError } from './quotations.errors.js';

const now = new Date('2030-01-06T10:00:00Z');
const later = new Date('2030-01-09T10:00:00Z');

describe('Quotation', () => {
  it('computes the total server-side and sets the expiry', () => {
    const draft = draftQuotation({
      bookingId: 'bk-1',
      providerId: 'prov-1',
      labourCost: 1200.1,
      materialCost: 349.2,
      note: null,
      validForHours: 48,
      now,
    });
    expect(draft.total).toBe(1549.3);
    expect(draft.expiresAt).toEqual(new Date('2030-01-08T10:00:00Z'));
  });

  it('is sent, then accepted or declined', () => {
    const sent = aQuotation({ status: 'DRAFT' }).send(now);
    expect(sent).toMatchObject({ status: 'SENT', sentAt: now });
    expect(sent.accept(now)).toMatchObject({ status: 'ACCEPTED', respondedAt: now });
    expect(sent.decline(now)).toMatchObject({ status: 'REJECTED', respondedAt: now });
  });

  it('cannot be accepted or sent after expiry', () => {
    expect(() => aQuotation().accept(later)).toThrow(QuotationExpiredError);
    expect(() => aQuotation({ status: 'DRAFT' }).send(later)).toThrow(QuotationExpiredError);
    expect(aQuotation().isExpiredAt(later)).toBe(true);
  });

  it.each([
    ['send a sent quotation', () => aQuotation().send(now)],
    ['accept a draft', () => aQuotation({ status: 'DRAFT' }).accept(now)],
    ['decline an accepted quotation', () => aQuotation({ status: 'ACCEPTED' }).decline(now)],
    ['accept an expired quotation', () => aQuotation({ status: 'EXPIRED' }).accept(now)],
  ])('refuses to %s', (_label, act) => {
    expect(act).toThrow(InvalidQuotationStateError);
  });
});
