import { beforeEach, describe, expect, it } from 'vitest';
import { aBooking } from '../../../../test/unit/fixtures/bookings.js';
import { FakeUnitOfWork, FixedClock, actorOf, mockOf, userOf } from '../../../../test/unit/mock.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { PaginatedResult } from '../../../common/utils/pagination.js';
import { BookingTransitionService } from '../../bookings/application/booking-transitions.js';
import { BookingRepository } from '../../bookings/domain/booking.repository.js';
import { BookingNotFoundError } from '../../bookings/domain/bookings.errors.js';
import { Dispute, type DisputeProps, DisputeRepository } from '../domain/dispute.js';
import {
  BookingNotDisputableError,
  DisputeAlreadyOpenError,
  DisputeNotFoundError,
  InvalidDisputeStateError,
} from '../domain/disputes.errors.js';
import { ResolveDisputeUseCase, StartDisputeReviewUseCase } from './dispute-admin.use-cases.js';
import { GetDisputeUseCase, ListDisputesUseCase } from './dispute-queries.use-cases.js';
import { RaiseDisputeUseCase } from './raise-dispute.use-case.js';

const clock = new FixedClock(new Date('2030-01-08T06:00:00Z'));
const aDispute = (overrides: Partial<DisputeProps> = {}) =>
  Dispute.restore({
    id: 'd-1',
    bookingId: 'bk-1',
    raisedById: 'cust-1',
    raisedByRole: 'CUSTOMER',
    reason: 'Unfinished',
    description: 'Left early',
    status: 'OPEN',
    outcome: null,
    resolution: null,
    resolvedById: null,
    resolvedAt: null,
    createdAt: clock.now(),
    ...overrides,
  });
const input = { bookingId: 'bk-1', reason: 'Unfinished', description: 'Left after one socket' };
const admin = actorOf('ADMIN', 'adm-1');
const page = { page: 1, limit: 20 };

describe('dispute use cases', () => {
  const disputes = mockOf<DisputeRepository>();
  const bookings = mockOf<BookingRepository>();
  const transitions = mockOf<BookingTransitionService>();
  const events = mockOf<DomainEventPublisher>();
  const audit = mockOf<AuditTrail>();
  const uow = new FakeUnitOfWork();

  beforeEach(() => {
    bookings.findById.mockResolvedValue(aBooking({ status: 'IN_PROGRESS' }));
    disputes.create.mockResolvedValue(aDispute());
    disputes.findById.mockResolvedValue(aDispute());
    disputes.save.mockImplementation((d: Dispute) => Promise.resolve(d));
    transitions.persist.mockImplementation((_b, to) => Promise.resolve(aBooking({ status: to })));
  });

  describe('RaiseDisputeUseCase', () => {
    const raise = new RaiseDisputeUseCase(disputes, bookings, transitions, events, clock, uow);

    it('opens a dispute and moves the booking to DISPUTED, publishing after commit', async () => {
      await raise.execute(userOf('CUSTOMER', 'cust-1'), input);
      expect(disputes.create).toHaveBeenCalledWith({
        ...input,
        raisedById: 'cust-1',
        raisedByRole: 'CUSTOMER',
      });
      expect(transitions.persist).toHaveBeenCalledWith(
        expect.anything(),
        'DISPUTED',
        { id: 'cust-1', role: 'CUSTOMER' },
        { reason: 'Unfinished' },
      );
      expect(transitions.publish).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'DISPUTED' }),
        'IN_PROGRESS',
        expect.anything(),
        expect.anything(),
      );
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'dispute.opened' }),
      );
    });

    it('lets the provider dispute a recently completed booking', async () => {
      bookings.findById.mockResolvedValue(
        aBooking({ status: 'COMPLETED', completedAt: new Date('2030-01-07T06:00:00Z') }),
      );
      await expect(raise.execute(userOf('PROVIDER', 'user-p1'), input)).resolves.toBeDefined();
    });

    it('reports an already disputed booking as a conflict', async () => {
      bookings.findById.mockResolvedValueOnce(aBooking({ status: 'DISPUTED' }));
      await expect(raise.execute(userOf('PROVIDER', 'user-p1'), input)).rejects.toBeInstanceOf(
        DisputeAlreadyOpenError,
      );
    });

    it('refuses strangers, admins, ineligible statuses and closed windows', async () => {
      await expect(raise.execute(userOf('CUSTOMER', 'x'), input)).rejects.toBeInstanceOf(
        BookingNotFoundError,
      );
      await expect(raise.execute(userOf('ADMIN', 'cust-1'), input)).rejects.toBeInstanceOf(
        BookingNotFoundError,
      );
      bookings.findById.mockResolvedValueOnce(aBooking({ status: 'ACCEPTED' }));
      await expect(raise.execute(userOf('CUSTOMER', 'cust-1'), input)).rejects.toMatchObject({
        details: { reason: 'STATUS' },
      });
      bookings.findById.mockResolvedValueOnce(
        aBooking({ status: 'COMPLETED', completedAt: new Date('2029-12-01T00:00:00Z') }),
      );
      await expect(raise.execute(userOf('CUSTOMER', 'cust-1'), input)).rejects.toBeInstanceOf(
        BookingNotDisputableError,
      );
      expect(disputes.create).not.toHaveBeenCalled();
    });
  });

  it('starts a review once, with audit', async () => {
    const start = new StartDisputeReviewUseCase(disputes, audit, uow);
    await expect(start.execute(admin, 'd-1')).resolves.toMatchObject({ status: 'UNDER_REVIEW' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dispute.review-started' }),
    );
    disputes.findById.mockResolvedValueOnce(aDispute({ status: 'UNDER_REVIEW' }));
    await expect(start.execute(admin, 'd-1')).rejects.toBeInstanceOf(InvalidDisputeStateError);
    disputes.findById.mockResolvedValueOnce(null);
    await expect(start.execute(admin, 'x')).rejects.toBeInstanceOf(DisputeNotFoundError);
  });

  describe('ResolveDisputeUseCase', () => {
    const resolve = new ResolveDisputeUseCase(
      disputes,
      bookings,
      transitions,
      audit,
      events,
      clock,
      uow,
    );

    it('closes the dispute and the booking as completed with an amount', async () => {
      bookings.findById.mockResolvedValue(aBooking({ status: 'DISPUTED' }));
      const result = await resolve.execute(admin, 'd-1', {
        outcome: 'BOOKING_COMPLETED',
        resolution: 'Work finished later',
        finalAmount: 900,
      });
      expect(result).toMatchObject({
        status: 'RESOLVED',
        outcome: 'BOOKING_COMPLETED',
        resolvedById: 'adm-1',
      });
      expect(transitions.persist).toHaveBeenCalledWith(expect.anything(), 'COMPLETED', admin, {
        reason: 'Work finished later',
        finalAmount: 900,
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'dispute.resolved' }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'dispute.resolved' }),
      );
    });

    it('can cancel the booking and refuses resolved or orphaned disputes', async () => {
      bookings.findById.mockResolvedValue(aBooking({ status: 'DISPUTED' }));
      await resolve.execute(admin, 'd-1', {
        outcome: 'BOOKING_CANCELLED',
        resolution: 'Refund agreed',
      });
      expect(transitions.persist).toHaveBeenCalledWith(expect.anything(), 'CANCELLED', admin, {
        reason: 'Refund agreed',
      });
      disputes.findById.mockResolvedValueOnce(aDispute({ status: 'RESOLVED' }));
      await expect(
        resolve.execute(admin, 'd-1', { outcome: 'BOOKING_CANCELLED', resolution: 'x' }),
      ).rejects.toBeInstanceOf(InvalidDisputeStateError);
      bookings.findById.mockResolvedValueOnce(null);
      await expect(
        resolve.execute(admin, 'd-1', { outcome: 'BOOKING_CANCELLED', resolution: 'x' }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });
  });

  it('lists disputes per role and shows them to parties and admins only', async () => {
    disputes.list.mockResolvedValue(PaginatedResult.of([], 0, page));
    const list = new ListDisputesUseCase(disputes);
    await list.execute(userOf('CUSTOMER', 'cust-1'), 'OPEN', page);
    await list.execute(admin, undefined, page);
    expect(disputes.list.mock.calls.map(([f]) => f)).toEqual([
      { status: 'OPEN', partyUserId: 'cust-1' },
      { status: undefined },
    ]);

    const get = new GetDisputeUseCase(disputes, bookings);
    await expect(get.execute(admin, 'd-1')).resolves.toBeDefined();
    await expect(get.execute(userOf('PROVIDER', 'user-p1'), 'd-1')).resolves.toBeDefined();
    await expect(get.execute(userOf('CUSTOMER', 'x'), 'd-1')).rejects.toBeInstanceOf(
      DisputeNotFoundError,
    );
    disputes.findById.mockResolvedValueOnce(null);
    await expect(get.execute(admin, 'x')).rejects.toBeInstanceOf(DisputeNotFoundError);
  });
});
