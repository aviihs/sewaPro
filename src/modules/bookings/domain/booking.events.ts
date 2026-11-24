import { type ActorRole } from '../../../common/auth/role.js';
import { type DomainEvent } from '../../../common/ports/domain-events.port.js';
import { type BookingStatus } from './booking-state-machine.js';

export interface BookingParties {
  readonly bookingId: string;
  readonly customerId: string;
  readonly providerId: string;
  readonly providerUserId: string;
}

export class BookingCreatedEvent implements DomainEvent {
  static readonly NAME = 'booking.created';
  readonly name = BookingCreatedEvent.NAME;
  constructor(
    readonly data: BookingParties & { readonly scheduledAt: Date },
    readonly occurredAt: Date,
  ) {}
}

/** Emitted for every status change (one subscription point for notifications, audit, payments). */
export class BookingStatusChangedEvent implements DomainEvent {
  static readonly NAME = 'booking.status-changed';
  readonly name = BookingStatusChangedEvent.NAME;
  constructor(
    readonly data: BookingParties & {
      readonly from: BookingStatus;
      readonly to: BookingStatus;
      readonly actorId: string | null;
      readonly actorRole: ActorRole;
      readonly reason: string | null;
      readonly finalAmount: number | null;
    },
    readonly occurredAt: Date,
  ) {}
}
