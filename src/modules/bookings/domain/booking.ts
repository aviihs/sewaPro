import { type ActorRole } from '../../../common/auth/role.js';
import { BookingStatus, bookingStateMachine } from './booking-state-machine.js';
import { BookingRule } from './bookings.errors.js';

export type PricingType = 'FIXED' | 'HOURLY' | 'STARTING_FROM' | 'QUOTATION';

/** Copy of the customer's address at booking time; later address edits never change it. */
export interface AddressSnapshot {
  readonly line1: string;
  readonly area: string | null;
  readonly city: string;
  readonly landmark: string | null;
  readonly latitude: number;
  readonly longitude: number;
}

export interface BookingProps {
  readonly id: string;
  readonly customerId: string;
  readonly providerId: string;
  /** User account of the provider (ownership checks, notifications). */
  readonly providerUserId: string;
  readonly serviceId: string;
  readonly status: BookingStatus;
  readonly scheduledAt: Date;
  readonly scheduledEndAt: Date;
  readonly problemDescription: string | null;
  readonly pricingType: PricingType;
  readonly quotedPrice: number | null;
  readonly estimatedAmount: number | null;
  readonly finalAmount: number | null;
  readonly address: AddressSnapshot;
  readonly cancelReason: string | null;
  readonly rejectionReason: string | null;
  readonly idempotencyKey: string | null;
  readonly acceptedAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BookingActor {
  readonly id: string | null;
  readonly role: ActorRole;
}

/** One row of the status history. */
export interface StatusChange {
  readonly bookingId: string;
  readonly from: BookingStatus | null;
  readonly to: BookingStatus;
  readonly actorId: string | null;
  readonly actorRole: ActorRole;
  readonly note: string | null;
  readonly at: Date;
}

export interface TransitionDetails {
  readonly reason?: string;
  readonly finalAmount?: number;
}

const CONTACT_VISIBLE: readonly BookingStatus[] = [
  BookingStatus.ACCEPTED,
  BookingStatus.ON_THE_WAY,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
  BookingStatus.DISPUTED,
];

export class Booking implements BookingProps {
  readonly id: string;
  readonly customerId: string;
  readonly providerId: string;
  readonly providerUserId: string;
  readonly serviceId: string;
  readonly status: BookingStatus;
  readonly scheduledAt: Date;
  readonly scheduledEndAt: Date;
  readonly problemDescription: string | null;
  readonly pricingType: PricingType;
  readonly quotedPrice: number | null;
  readonly estimatedAmount: number | null;
  readonly finalAmount: number | null;
  readonly address: AddressSnapshot;
  readonly cancelReason: string | null;
  readonly rejectionReason: string | null;
  readonly idempotencyKey: string | null;
  readonly acceptedAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: BookingProps) {
    Object.assign(this, props);
  }

  static restore(props: BookingProps): Booking {
    return new Booking(props);
  }

  isCustomer(userId: string): boolean {
    return this.customerId === userId;
  }

  isProvider(userId: string): boolean {
    return this.providerUserId === userId;
  }

  /** The provider sees the exact address and the phone numbers only once they have accepted. */
  get contactVisible(): boolean {
    return CONTACT_VISIBLE.includes(this.status);
  }

  /**
   * Applies a status change through the state machine and stamps the
   * matching timestamp/field. Returns the new booking and its history row.
   */
  transition(
    to: BookingStatus,
    actor: BookingActor,
    at: Date,
    details: TransitionDetails = {},
  ): { booking: Booking; change: StatusChange } {
    bookingStateMachine.assert(this.status, to, actor.role);
    const changes: Partial<BookingProps> = { status: to };
    if (to === BookingStatus.ACCEPTED) Object.assign(changes, { acceptedAt: at });
    if (to === BookingStatus.IN_PROGRESS) Object.assign(changes, { startedAt: at });
    if (to === BookingStatus.REJECTED)
      Object.assign(changes, { rejectionReason: details.reason ?? null });
    if (to === BookingStatus.CANCELLED) {
      Object.assign(changes, { cancelledAt: at, cancelReason: details.reason ?? null });
    }
    if (to === BookingStatus.COMPLETED) {
      const finalAmount = details.finalAmount ?? this.finalAmount;
      if (finalAmount === null) throw BookingRule.finalAmountRequired();
      Object.assign(changes, { completedAt: this.completedAt ?? at, finalAmount });
    }
    const change: StatusChange = {
      bookingId: this.id,
      from: this.status,
      to,
      actorId: actor.id,
      actorRole: actor.role,
      note: details.reason ?? null,
      at,
    };
    return { booking: new Booking(Object.assign({}, this, changes)), change };
  }

  withEstimatedAmount(amount: number): Booking {
    return new Booking(Object.assign({}, this, { estimatedAmount: amount }));
  }
}
