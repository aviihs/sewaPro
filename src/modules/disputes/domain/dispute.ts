import { type ActorRole } from '../../../common/auth/role.js';
import { type DomainEvent } from '../../../common/ports/domain-events.port.js';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import { InvalidDisputeStateError } from './disputes.errors.js';

export const DisputeStatus = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
} as const;
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus];

/** How the admin closed the dispute; drives the booking's final status. */
export const DisputeOutcome = {
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
} as const;
export type DisputeOutcome = (typeof DisputeOutcome)[keyof typeof DisputeOutcome];

/** A completed booking can be disputed up to this many days after completion. */
export const DISPUTE_WINDOW_DAYS = 7;

export interface DisputeProps {
  readonly id: string;
  readonly bookingId: string;
  readonly raisedById: string;
  readonly raisedByRole: ActorRole;
  readonly reason: string;
  readonly description: string;
  readonly status: DisputeStatus;
  readonly outcome: DisputeOutcome | null;
  readonly resolution: string | null;
  readonly resolvedById: string | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
}

export type NewDispute = Pick<
  DisputeProps,
  'bookingId' | 'raisedById' | 'raisedByRole' | 'reason' | 'description'
>;

export class Dispute implements DisputeProps {
  readonly id: string;
  readonly bookingId: string;
  readonly raisedById: string;
  readonly raisedByRole: ActorRole;
  readonly reason: string;
  readonly description: string;
  readonly status: DisputeStatus;
  readonly outcome: DisputeOutcome | null;
  readonly resolution: string | null;
  readonly resolvedById: string | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;

  private constructor(props: DisputeProps) {
    Object.assign(this, props);
  }

  static restore(props: DisputeProps): Dispute {
    return new Dispute(props);
  }

  startReview(): Dispute {
    if (this.status !== DisputeStatus.OPEN)
      throw new InvalidDisputeStateError(this.status, 'review');
    return new Dispute(Object.assign({}, this, { status: DisputeStatus.UNDER_REVIEW }));
  }

  resolve(outcome: DisputeOutcome, resolution: string, adminId: string, at: Date): Dispute {
    if (this.status === DisputeStatus.RESOLVED)
      throw new InvalidDisputeStateError(this.status, 'resolve');
    return new Dispute(
      Object.assign({}, this, {
        status: DisputeStatus.RESOLVED,
        outcome,
        resolution,
        resolvedById: adminId,
        resolvedAt: at,
      }),
    );
  }
}

export interface DisputeListFilter {
  readonly status?: DisputeStatus;
  /** Only disputes on bookings where this user is the customer or the provider. */
  readonly partyUserId?: string;
}

export abstract class DisputeRepository {
  /** @throws DisputeAlreadyOpenError when the booking already has an unresolved dispute. */
  abstract create(dispute: NewDispute): Promise<Dispute>;
  abstract findById(id: string): Promise<Dispute | null>;
  /** Persists status fields only if the stored status is still `expected`. */
  abstract save(dispute: Dispute, expected: DisputeStatus): Promise<Dispute>;
  abstract list(filter: DisputeListFilter, page: PageRequest): Promise<PaginatedResult<Dispute>>;
}

interface DisputeEventData {
  readonly disputeId: string;
  readonly bookingId: string;
  readonly customerId: string;
  readonly providerUserId: string;
}

export class DisputeOpenedEvent implements DomainEvent {
  static readonly NAME = 'dispute.opened';
  readonly name = DisputeOpenedEvent.NAME;
  constructor(
    readonly data: DisputeEventData & { readonly raisedByRole: ActorRole; readonly reason: string },
    readonly occurredAt: Date,
  ) {}
}

export class DisputeResolvedEvent implements DomainEvent {
  static readonly NAME = 'dispute.resolved';
  readonly name = DisputeResolvedEvent.NAME;
  constructor(
    readonly data: DisputeEventData & {
      readonly outcome: DisputeOutcome;
      readonly resolution: string;
    },
    readonly occurredAt: Date,
  ) {}
}
