import { Injectable } from '@nestjs/common';
import { type Actor, type AuthenticatedUser } from '../../../common/auth/role.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { BookingTransitionService } from '../../bookings/application/booking-transitions.js';
import { BookingStatus } from '../../bookings/domain/booking-state-machine.js';
import { type Booking, type BookingActor } from '../../bookings/domain/booking.js';
import { type Quotation, QuotationStatus } from '../domain/quotation.js';
import { QuotationRespondedEvent } from '../domain/quotation.events.js';
import { QuotationRepository } from '../domain/quotation.repository.js';
import { assertQuotable } from './provider-quotations.use-cases.js';
import { QuotationAccess } from './quotation-access.js';

const SYSTEM: BookingActor = { id: null, role: 'SYSTEM' };

const responded = (booking: Booking, quotation: Quotation, accepted: boolean, at: Date) =>
  new QuotationRespondedEvent(
    {
      quotationId: quotation.id,
      bookingId: booking.id,
      customerId: booking.customerId,
      providerUserId: booking.providerUserId,
      total: quotation.total,
      accepted,
    },
    at,
  );

/**
 * One transaction: quotation → ACCEPTED, booking.estimatedAmount = total, a
 * PENDING booking is confirmed (→ ACCEPTED by SYSTEM, with history), audit row.
 * Expired quotations are refused even if the expiry job has not run yet.
 */
@Injectable()
export class AcceptQuotationUseCase {
  constructor(
    private readonly access: QuotationAccess,
    private readonly quotations: QuotationRepository,
    private readonly transitions: BookingTransitionService,
    private readonly audit: AuditTrail,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(actor: Actor, bookingId: string, quotationId: string): Promise<Quotation> {
    const now = this.clock.now();
    const result = await this.uow.run(async () => {
      const booking = await this.access.booking(actor, bookingId, 'customer');
      const quotation = await this.access.quotation(booking, quotationId);
      assertQuotable(booking);
      const accepted = await this.quotations.save(quotation.accept(now), QuotationStatus.SENT);
      await this.access.bookings.setEstimatedAmount(booking.id, accepted.total);
      let confirmed: Booking | null = null;
      if (booking.status === BookingStatus.PENDING) {
        const { booking: next, change } = booking.transition(BookingStatus.ACCEPTED, SYSTEM, now, {
          reason: `Quotation ${accepted.id} accepted by the customer`,
        });
        confirmed = await this.access.bookings.saveTransition(next, change);
      }
      await this.audit.record({
        actor,
        action: 'quotation.accepted',
        entityType: 'Quotation',
        entityId: accepted.id,
        before: { status: quotation.status, bookingStatus: booking.status },
        after: {
          status: accepted.status,
          total: accepted.total,
          bookingStatus: confirmed?.status ?? booking.status,
        },
      });
      return { booking, accepted, confirmed };
    });
    await this.events.publish(responded(result.booking, result.accepted, true, now));
    if (result.confirmed)
      await this.transitions.publish(result.confirmed, BookingStatus.PENDING, SYSTEM);
    return result.accepted;
  }
}

@Injectable()
export class DeclineQuotationUseCase {
  constructor(
    private readonly access: QuotationAccess,
    private readonly quotations: QuotationRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(
    user: AuthenticatedUser,
    bookingId: string,
    quotationId: string,
  ): Promise<Quotation> {
    const now = this.clock.now();
    const booking = await this.access.booking(user, bookingId, 'customer');
    const quotation = await this.access.quotation(booking, quotationId);
    const declined = await this.quotations.save(quotation.decline(now), QuotationStatus.SENT);
    await this.events.publish(responded(booking, declined, false, now));
    return declined;
  }
}
