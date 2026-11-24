import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser } from '../../../common/auth/role.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { ProviderRepository } from '../../providers/domain/provider.repositories.js';
import { BookingStatus } from '../domain/booking-state-machine.js';
import { type Booking, type BookingActor, type TransitionDetails } from '../domain/booking.js';
import { BookingStatusChangedEvent } from '../domain/booking.events.js';
import { type BookingDetail, BookingRepository } from '../domain/booking.repository.js';
import { BookingNotFoundError } from '../domain/bookings.errors.js';

export type BookingSide = 'customer' | 'provider';

/**
 * Loads a booking the caller is a party to (404 otherwise, no IDOR), applies
 * the transition, persists it with its history row in one transaction, and
 * publishes `booking.status-changed` after commit.
 */
@Injectable()
export class BookingTransitionService {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly providers: ProviderRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async loadOwned(user: AuthenticatedUser, bookingId: string, side: BookingSide): Promise<Booking> {
    const booking = await this.bookings.findById(bookingId);
    const owns = side === 'customer' ? booking?.isCustomer(user.id) : booking?.isProvider(user.id);
    if (!booking || owns !== true) throw new BookingNotFoundError();
    return booking;
  }

  /** Transition + history + job counter, published after commit; returns the fresh detail. */
  async apply(
    booking: Booking,
    to: BookingStatus,
    actor: BookingActor,
    details: TransitionDetails = {},
  ): Promise<BookingDetail> {
    const saved = await this.uow.run(() => this.persist(booking, to, actor, details));
    await this.publish(saved, booking.status, actor, details);
    return this.detail(saved.id);
  }

  /**
   * Persists a transition inside the caller's unit of work WITHOUT publishing.
   * Callers that own a larger transaction publish after their commit.
   */
  async persist(
    booking: Booking,
    to: BookingStatus,
    actor: BookingActor,
    details: TransitionDetails = {},
  ): Promise<Booking> {
    const { booking: next, change } = booking.transition(to, actor, this.clock.now(), details);
    const saved = await this.bookings.saveTransition(next, change);
    if (to === BookingStatus.COMPLETED && booking.completedAt === null) {
      await this.providers.incrementCompletedJobs(booking.providerId);
    }
    return saved;
  }

  async detail(bookingId: string): Promise<BookingDetail> {
    const detail = await this.bookings.findDetail(bookingId);
    if (!detail) throw new BookingNotFoundError();
    return detail;
  }

  async publish(
    booking: Booking,
    from: BookingStatus,
    actor: BookingActor,
    details: TransitionDetails = {},
  ): Promise<void> {
    await this.events.publish(
      new BookingStatusChangedEvent(
        {
          bookingId: booking.id,
          customerId: booking.customerId,
          providerId: booking.providerId,
          providerUserId: booking.providerUserId,
          from,
          to: booking.status,
          actorId: actor.id,
          actorRole: actor.role,
          reason: details.reason ?? null,
          finalAmount: booking.finalAmount,
        },
        this.clock.now(),
      ),
    );
  }
}
