import { Injectable } from '@nestjs/common';
import { type Actor } from '../../../common/auth/role.js';
import { AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { BookingTransitionService } from '../../bookings/application/booking-transitions.js';
import { BookingStatus } from '../../bookings/domain/booking-state-machine.js';
import { BookingRepository } from '../../bookings/domain/booking.repository.js';
import { BookingNotFoundError } from '../../bookings/domain/bookings.errors.js';
import {
  type Dispute,
  DisputeOutcome,
  DisputeRepository,
  DisputeResolvedEvent,
  DisputeStatus,
} from '../domain/dispute.js';
import { DisputeNotFoundError } from '../domain/disputes.errors.js';

async function load(disputes: DisputeRepository, id: string): Promise<Dispute> {
  const dispute = await disputes.findById(id);
  if (!dispute) throw new DisputeNotFoundError();
  return dispute;
}

/** Admin takes an OPEN dispute into review (audited). */
@Injectable()
export class StartDisputeReviewUseCase {
  constructor(
    private readonly disputes: DisputeRepository,
    private readonly audit: AuditTrail,
    private readonly uow: UnitOfWork,
  ) {}

  execute(actor: Actor, disputeId: string): Promise<Dispute> {
    return this.uow.run(async () => {
      const dispute = await load(this.disputes, disputeId);
      const saved = await this.disputes.save(dispute.startReview(), DisputeStatus.OPEN);
      await this.audit.record({
        actor,
        action: 'dispute.review-started',
        entityType: 'Dispute',
        entityId: disputeId,
        before: { status: dispute.status },
        after: { status: saved.status },
      });
      return saved;
    });
  }
}

export interface ResolveDisputeInput {
  readonly outcome: DisputeOutcome;
  readonly resolution: string;
  /** Needed when closing as completed a booking disputed before it was completed. */
  readonly finalAmount?: number;
}

/**
 * Closes the dispute and moves the booking DISPUTED → COMPLETED or CANCELLED
 * (by ADMIN) in one transaction, with an audit row; both parties are notified.
 */
@Injectable()
export class ResolveDisputeUseCase {
  constructor(
    private readonly disputes: DisputeRepository,
    private readonly bookings: BookingRepository,
    private readonly transitions: BookingTransitionService,
    private readonly audit: AuditTrail,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(actor: Actor, disputeId: string, input: ResolveDisputeInput): Promise<Dispute> {
    const now = this.clock.now();
    const to =
      input.outcome === DisputeOutcome.BOOKING_COMPLETED
        ? BookingStatus.COMPLETED
        : BookingStatus.CANCELLED;
    const details = {
      reason: input.resolution,
      ...(input.finalAmount === undefined ? {} : { finalAmount: input.finalAmount }),
    };

    const result = await this.uow.run(async () => {
      const dispute = await load(this.disputes, disputeId);
      const resolved = dispute.resolve(input.outcome, input.resolution, actor.id, now);
      const booking = await this.bookings.findById(dispute.bookingId);
      if (!booking) throw new BookingNotFoundError();
      const saved = await this.disputes.save(resolved, dispute.status);
      const movedBooking = await this.transitions.persist(booking, to, actor, details);
      await this.audit.record({
        actor,
        action: 'dispute.resolved',
        entityType: 'Dispute',
        entityId: disputeId,
        before: { status: dispute.status, bookingStatus: booking.status },
        after: { status: saved.status, outcome: input.outcome, bookingStatus: movedBooking.status },
      });
      return { saved, booking: movedBooking, from: booking.status };
    });

    await this.transitions.publish(result.booking, result.from, actor, details);
    await this.events.publish(
      new DisputeResolvedEvent(
        {
          disputeId,
          bookingId: result.booking.id,
          customerId: result.booking.customerId,
          providerUserId: result.booking.providerUserId,
          outcome: input.outcome,
          resolution: input.resolution,
        },
        now,
      ),
    );
    return result.saved;
  }
}
