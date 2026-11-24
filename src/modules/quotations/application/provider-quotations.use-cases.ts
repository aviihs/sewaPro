import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser } from '../../../common/auth/role.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { BookingStatus } from '../../bookings/domain/booking-state-machine.js';
import { type Booking } from '../../bookings/domain/booking.js';
import { type Quotation, QuotationStatus, draftQuotation } from '../domain/quotation.js';
import { QuotationSentEvent } from '../domain/quotation.events.js';
import { QuotationRepository } from '../domain/quotation.repository.js';
import { BookingNotQuotableError } from '../domain/quotations.errors.js';
import { QuotationAccess } from './quotation-access.js';

const QUOTABLE: readonly BookingStatus[] = [BookingStatus.PENDING, BookingStatus.ACCEPTED];

export function assertQuotable(booking: Booking): void {
  if (!QUOTABLE.includes(booking.status)) throw new BookingNotQuotableError(booking.status);
}

export interface CreateQuotationInput {
  readonly labourCost: number;
  readonly materialCost: number;
  readonly note: string | null;
  readonly validForHours: number;
}

/** Provider drafts a quotation for their own PENDING/ACCEPTED booking (one open at a time). */
@Injectable()
export class CreateQuotationUseCase {
  constructor(
    private readonly access: QuotationAccess,
    private readonly quotations: QuotationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    user: AuthenticatedUser,
    bookingId: string,
    input: CreateQuotationInput,
  ): Promise<Quotation> {
    const booking = await this.access.booking(user, bookingId, 'provider');
    assertQuotable(booking);
    return this.quotations.create(
      draftQuotation({
        bookingId,
        providerId: booking.providerId,
        ...input,
        now: this.clock.now(),
      }),
    );
  }
}

/** Sends a draft to the customer (notified via `quotation.sent`). */
@Injectable()
export class SendQuotationUseCase {
  constructor(
    private readonly access: QuotationAccess,
    private readonly quotations: QuotationRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(user: AuthenticatedUser, quotationId: string): Promise<Quotation> {
    const now = this.clock.now();
    const { booking, quotation } = await this.access.providerQuotation(user, quotationId);
    assertQuotable(booking);
    const sent = await this.quotations.save(quotation.send(now), QuotationStatus.DRAFT);
    await this.events.publish(
      new QuotationSentEvent(
        {
          quotationId: sent.id,
          bookingId: booking.id,
          customerId: booking.customerId,
          providerUserId: booking.providerUserId,
          total: sent.total,
          expiresAt: sent.expiresAt,
        },
        now,
      ),
    );
    return sent;
  }
}

@Injectable()
export class ListQuotationsUseCase {
  constructor(private readonly access: QuotationAccess) {}

  /** Providers see their drafts too; customers only see sent and answered quotations. */
  async execute(
    user: AuthenticatedUser,
    bookingId: string,
    side: 'customer' | 'provider',
  ): Promise<Quotation[]> {
    const booking = await this.access.booking(user, bookingId, side);
    return this.access.quotations.listForBooking(booking.id, side === 'provider');
  }
}

/** Scheduled: SENT quotations past their expiry become EXPIRED. */
@Injectable()
export class ExpireQuotationsUseCase {
  constructor(
    private readonly quotations: QuotationRepository,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    return this.quotations.expireDue(this.clock.now());
  }
}
