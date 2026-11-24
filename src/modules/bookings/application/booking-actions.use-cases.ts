import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser } from '../../../common/auth/role.js';
import { BookingStatus } from '../domain/booking-state-machine.js';
import { type BookingDetail } from '../domain/booking.repository.js';
import { BookingTransitionService } from './booking-transitions.js';

/** Customer cancels their own PENDING or ACCEPTED booking. */
@Injectable()
export class CancelBookingUseCase {
  constructor(private readonly transitions: BookingTransitionService) {}

  async execute(
    user: AuthenticatedUser,
    bookingId: string,
    reason: string | null,
  ): Promise<BookingDetail> {
    const booking = await this.transitions.loadOwned(user, bookingId, 'customer');
    return this.transitions.apply(booking, BookingStatus.CANCELLED, user, reason ? { reason } : {});
  }
}

@Injectable()
export class AcceptBookingUseCase {
  constructor(private readonly transitions: BookingTransitionService) {}

  async execute(user: AuthenticatedUser, bookingId: string): Promise<BookingDetail> {
    const booking = await this.transitions.loadOwned(user, bookingId, 'provider');
    return this.transitions.apply(booking, BookingStatus.ACCEPTED, user);
  }
}

@Injectable()
export class RejectBookingUseCase {
  constructor(private readonly transitions: BookingTransitionService) {}

  async execute(
    user: AuthenticatedUser,
    bookingId: string,
    reason: string,
  ): Promise<BookingDetail> {
    const booking = await this.transitions.loadOwned(user, bookingId, 'provider');
    return this.transitions.apply(booking, BookingStatus.REJECTED, user, { reason });
  }
}

@Injectable()
export class MarkOnTheWayUseCase {
  constructor(private readonly transitions: BookingTransitionService) {}

  async execute(user: AuthenticatedUser, bookingId: string): Promise<BookingDetail> {
    const booking = await this.transitions.loadOwned(user, bookingId, 'provider');
    return this.transitions.apply(booking, BookingStatus.ON_THE_WAY, user);
  }
}

@Injectable()
export class StartJobUseCase {
  constructor(private readonly transitions: BookingTransitionService) {}

  async execute(user: AuthenticatedUser, bookingId: string): Promise<BookingDetail> {
    const booking = await this.transitions.loadOwned(user, bookingId, 'provider');
    return this.transitions.apply(booking, BookingStatus.IN_PROGRESS, user);
  }
}

/** Provider completes the job and records the final amount charged (NPR). */
@Injectable()
export class CompleteJobUseCase {
  constructor(private readonly transitions: BookingTransitionService) {}

  async execute(
    user: AuthenticatedUser,
    bookingId: string,
    finalAmount: number,
  ): Promise<BookingDetail> {
    const booking = await this.transitions.loadOwned(user, bookingId, 'provider');
    return this.transitions.apply(booking, BookingStatus.COMPLETED, user, { finalAmount });
  }
}
