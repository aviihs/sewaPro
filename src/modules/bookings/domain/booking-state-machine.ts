import { ActorRole } from '../../../common/auth/role.js';
import {
  BookingTransitionForbiddenError,
  InvalidBookingTransitionError,
} from './bookings.errors.js';

export const BookingStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  ON_THE_WAY: 'ON_THE_WAY',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  DISPUTED: 'DISPUTED',
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

const { CUSTOMER, PROVIDER, ADMIN, SYSTEM } = ActorRole;

export type TransitionTable = Readonly<
  Record<BookingStatus, Readonly<Partial<Record<BookingStatus, readonly ActorRole[]>>>>
>;

/**
 * Every legal transition and who may perform it. Anything not listed is illegal.
 * SYSTEM accepts a booking when the customer accepts the provider's quotation.
 * ADMIN closes disputes (back to COMPLETED, or CANCELLED).
 * A customer can never complete a booking.
 */
export const BOOKING_TRANSITIONS: TransitionTable = {
  PENDING: { ACCEPTED: [PROVIDER, SYSTEM], REJECTED: [PROVIDER], CANCELLED: [CUSTOMER, ADMIN] },
  ACCEPTED: { ON_THE_WAY: [PROVIDER], CANCELLED: [CUSTOMER, ADMIN] },
  ON_THE_WAY: { IN_PROGRESS: [PROVIDER] },
  IN_PROGRESS: { COMPLETED: [PROVIDER], DISPUTED: [CUSTOMER, PROVIDER] },
  COMPLETED: { DISPUTED: [CUSTOMER, PROVIDER] },
  DISPUTED: { COMPLETED: [ADMIN], CANCELLED: [ADMIN] },
  REJECTED: {},
  CANCELLED: {},
};

/** Pure rules for moving a booking between statuses, driven by a transition table. */
export class BookingStateMachine {
  constructor(private readonly table: TransitionTable = BOOKING_TRANSITIONS) {}

  targetsFrom(from: BookingStatus): BookingStatus[] {
    return Object.keys(this.table[from]) as BookingStatus[];
  }

  isLegal(from: BookingStatus, to: BookingStatus): boolean {
    return this.table[from][to] !== undefined;
  }

  canPerform(from: BookingStatus, to: BookingStatus, actor: ActorRole): boolean {
    return this.table[from][to]?.includes(actor) ?? false;
  }

  /**
   * @throws InvalidBookingTransitionError (409) when the move does not exist;
   * BookingTransitionForbiddenError (403) when it exists but not for this actor.
   */
  assert(from: BookingStatus, to: BookingStatus, actor: ActorRole): void {
    if (!this.isLegal(from, to)) throw new InvalidBookingTransitionError(from, to);
    if (!this.canPerform(from, to, actor))
      throw new BookingTransitionForbiddenError(from, to, actor);
  }

  isTerminal(status: BookingStatus): boolean {
    return this.targetsFrom(status).length === 0;
  }
}

/** The machine used by `Booking`. */
export const bookingStateMachine = new BookingStateMachine();
