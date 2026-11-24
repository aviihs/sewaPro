import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser, Role } from '../../../common/auth/role.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { BookingTransitionService } from '../../bookings/application/booking-transitions.js';
import { BookingStatus } from '../../bookings/domain/booking-state-machine.js';
import { type Booking } from '../../bookings/domain/booking.js';
import { BookingRepository } from '../../bookings/domain/booking.repository.js';
import { BookingNotFoundError } from '../../bookings/domain/bookings.errors.js';
import {
  DISPUTE_WINDOW_DAYS,
  type Dispute,
  DisputeOpenedEvent,
  DisputeRepository,
} from '../domain/dispute.js';
import { BookingNotDisputableError, DisputeAlreadyOpenError } from '../domain/disputes.errors.js';

export interface RaiseDisputeInput {
  readonly bookingId: string;
  readonly reason: string;
  readonly description: string;
}

function assertDisputable(booking: Booking, now: Date): void {
  if (booking.status === BookingStatus.IN_PROGRESS) return;
  if (booking.status === BookingStatus.DISPUTED) throw new DisputeAlreadyOpenError();
  if (booking.status !== BookingStatus.COMPLETED || !booking.completedAt) {
    throw new BookingNotDisputableError('STATUS');
  }
  if (now.getTime() - booking.completedAt.getTime() > DISPUTE_WINDOW_DAYS * 86_400_000) {
    throw new BookingNotDisputableError('WINDOW_CLOSED');
  }
}

/**
 * The customer or provider of an IN_PROGRESS (or recently COMPLETED) booking
 * opens a dispute; the booking moves to DISPUTED in the same transaction.
 */
@Injectable()
export class RaiseDisputeUseCase {
  constructor(
    private readonly disputes: DisputeRepository,
    private readonly bookings: BookingRepository,
    private readonly transitions: BookingTransitionService,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(user: AuthenticatedUser, input: RaiseDisputeInput): Promise<Dispute> {
    const now = this.clock.now();
    const booking = await this.bookings.findById(input.bookingId);
    const isParty = booking?.isCustomer(user.id) === true || booking?.isProvider(user.id) === true;
    if (!booking || !isParty || user.role === Role.ADMIN) throw new BookingNotFoundError();
    assertDisputable(booking, now);

    const { dispute, saved } = await this.uow.run(async () => {
      const created = await this.disputes.create({
        ...input,
        raisedById: user.id,
        raisedByRole: user.role,
      });
      const moved = await this.transitions.persist(booking, BookingStatus.DISPUTED, user, {
        reason: input.reason,
      });
      return { dispute: created, saved: moved };
    });
    await this.transitions.publish(saved, booking.status, user, { reason: input.reason });
    await this.events.publish(
      new DisputeOpenedEvent(
        {
          disputeId: dispute.id,
          bookingId: booking.id,
          customerId: booking.customerId,
          providerUserId: booking.providerUserId,
          raisedByRole: user.role,
          reason: input.reason,
        },
        now,
      ),
    );
    return dispute;
  }
}
