import { beforeEach, describe, expect, it } from 'vitest';
import { aBooking } from '../../../../test/unit/fixtures/bookings.js';
import { aQuotation } from '../../../../test/unit/fixtures/quotations.js';
import { FakeUnitOfWork, FixedClock, actorOf, mockOf, userOf } from '../../../../test/unit/mock.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { BookingTransitionService } from '../../bookings/application/booking-transitions.js';
import { type Booking } from '../../bookings/domain/booking.js';
import { BookingRepository } from '../../bookings/domain/booking.repository.js';
import { BookingNotFoundError } from '../../bookings/domain/bookings.errors.js';
import { type Quotation } from '../domain/quotation.js';
import { QuotationRepository } from '../domain/quotation.repository.js';
import {
  BookingNotQuotableError,
  QuotationExpiredError,
  QuotationNotFoundError,
} from '../domain/quotations.errors.js';
import {
  CreateQuotationUseCase,
  ExpireQuotationsUseCase,
  ListQuotationsUseCase,
  SendQuotationUseCase,
} from './provider-quotations.use-cases.js';
import { QuotationAccess } from './quotation-access.js';
import { AcceptQuotationUseCase, DeclineQuotationUseCase } from './respond-quotation.use-cases.js';

const provider = userOf('PROVIDER', 'user-p1');
const customer = actorOf('CUSTOMER', 'cust-1');
const clock = new FixedClock(new Date('2030-01-06T10:00:00Z'));

describe('quotation use cases', () => {
  const bookings = mockOf<BookingRepository>();
  const quotations = mockOf<QuotationRepository>();
  const events = mockOf<DomainEventPublisher>();
  const audit = mockOf<AuditTrail>();
  const transitions = mockOf<BookingTransitionService>();
  const access = new QuotationAccess(bookings, quotations);

  beforeEach(() => {
    bookings.findById.mockResolvedValue(aBooking());
    quotations.findById.mockResolvedValue(aQuotation());
    quotations.create.mockImplementation((q) =>
      Promise.resolve(aQuotation({ ...q, status: 'DRAFT' })),
    );
    quotations.save.mockImplementation((q: Quotation) => Promise.resolve(q));
    bookings.saveTransition.mockImplementation((b: Booking) => Promise.resolve(b));
  });

  it('drafts a quotation with a server-computed total for the own booking', async () => {
    const result = await new CreateQuotationUseCase(access, quotations, clock).execute(
      provider,
      'bk-1',
      {
        labourCost: 1000.25,
        materialCost: 499.75,
        note: null,
        validForHours: 24,
      },
    );
    expect(quotations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 1500,
        providerId: 'prov-1',
        expiresAt: new Date('2030-01-07T10:00:00Z'),
      }),
    );
    expect(result.status).toBe('DRAFT');
  });

  it('refuses other providers and finished bookings', async () => {
    const create = new CreateQuotationUseCase(access, quotations, clock);
    const input = { labourCost: 1, materialCost: 1, note: null, validForHours: 1 };
    await expect(create.execute(userOf('PROVIDER', 'x'), 'bk-1', input)).rejects.toBeInstanceOf(
      BookingNotFoundError,
    );
    bookings.findById.mockResolvedValue(aBooking({ status: 'IN_PROGRESS' }));
    await expect(create.execute(provider, 'bk-1', input)).rejects.toBeInstanceOf(
      BookingNotQuotableError,
    );
  });

  it('sends a draft and notifies the customer', async () => {
    quotations.findById.mockResolvedValue(aQuotation({ status: 'DRAFT' }));
    const sent = await new SendQuotationUseCase(access, quotations, events, clock).execute(
      provider,
      'q-1',
    );
    expect(sent.status).toBe('SENT');
    expect(quotations.save).toHaveBeenCalledWith(expect.anything(), 'DRAFT');
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'quotation.sent' }),
    );
  });

  it('hides quotations of other providers', async () => {
    const send = new SendQuotationUseCase(access, quotations, events, clock);
    await expect(send.execute(userOf('PROVIDER', 'x'), 'q-1')).rejects.toBeInstanceOf(
      QuotationNotFoundError,
    );
    quotations.findById.mockResolvedValue(null);
    await expect(send.execute(provider, 'q-1')).rejects.toBeInstanceOf(QuotationNotFoundError);
  });

  it('lists drafts for providers only', async () => {
    quotations.listForBooking.mockResolvedValue([]);
    const list = new ListQuotationsUseCase(access);
    await list.execute(provider, 'bk-1', 'provider');
    await list.execute(customer, 'bk-1', 'customer');
    expect(quotations.listForBooking.mock.calls).toEqual([
      ['bk-1', true],
      ['bk-1', false],
    ]);
  });

  describe('AcceptQuotationUseCase', () => {
    const uow = new FakeUnitOfWork();
    const accept = new AcceptQuotationUseCase(
      access,
      quotations,
      transitions,
      audit,
      events,
      clock,
      uow,
    );

    it('accepts, sets the estimate and confirms a pending booking as SYSTEM, in one transaction', async () => {
      const result = await accept.execute(customer, 'bk-1', 'q-1');

      expect(result.status).toBe('ACCEPTED');
      expect(uow.runs).toBe(1);
      expect(bookings.setEstimatedAmount).toHaveBeenCalledWith('bk-1', 2000);
      expect(bookings.saveTransition).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ACCEPTED' }),
        expect.objectContaining({
          from: 'PENDING',
          to: 'ACCEPTED',
          actorRole: 'SYSTEM',
          actorId: null,
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'quotation.accepted', actor: customer }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'quotation.responded' }),
      );
      expect(transitions.publish).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ACCEPTED' }),
        'PENDING',
        {
          id: null,
          role: 'SYSTEM',
        },
      );
    });

    it('only updates the estimate when the booking is already accepted', async () => {
      bookings.findById.mockResolvedValue(aBooking({ status: 'ACCEPTED' }));
      await accept.execute(customer, 'bk-1', 'q-1');
      expect(bookings.saveTransition).not.toHaveBeenCalled();
      expect(transitions.publish).not.toHaveBeenCalled();
    });

    it('refuses expired quotations, quotations of other bookings and strangers', async () => {
      clock.advance(3 * 86_400_000);
      await expect(accept.execute(customer, 'bk-1', 'q-1')).rejects.toBeInstanceOf(
        QuotationExpiredError,
      );
      clock.advance(-3 * 86_400_000);
      quotations.findById.mockResolvedValue(aQuotation({ bookingId: 'other' }));
      await expect(accept.execute(customer, 'bk-1', 'q-1')).rejects.toBeInstanceOf(
        QuotationNotFoundError,
      );
      await expect(accept.execute(actorOf('CUSTOMER', 'x'), 'bk-1', 'q-1')).rejects.toBeInstanceOf(
        BookingNotFoundError,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('declines and notifies the provider', async () => {
    const declined = await new DeclineQuotationUseCase(access, quotations, events, clock).execute(
      customer,
      'bk-1',
      'q-1',
    );
    expect(declined.status).toBe('REJECTED');
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'quotation.responded',
        data: expect.objectContaining({ accepted: false }) as unknown,
      }),
    );
  });

  it('expires due quotations', async () => {
    quotations.expireDue.mockResolvedValue(3);
    await expect(new ExpireQuotationsUseCase(quotations, clock).execute()).resolves.toBe(3);
    expect(quotations.expireDue).toHaveBeenCalledWith(clock.now());
  });
});
