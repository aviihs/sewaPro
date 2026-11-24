import { type NewQuotation, type Quotation, type QuotationStatus } from './quotation.js';

export abstract class QuotationRepository {
  /** @throws QuotationAlreadyOpenError when the booking already has a DRAFT/SENT quotation. */
  abstract create(quotation: NewQuotation): Promise<Quotation>;
  abstract findById(id: string): Promise<Quotation | null>;
  /** Newest first; drafts are excluded unless requested (customers never see drafts). */
  abstract listForBooking(bookingId: string, includeDrafts: boolean): Promise<Quotation[]>;
  /**
   * Persists status/timestamps only if the stored status is still `expected`.
   * @throws ConcurrentQuotationUpdateError otherwise.
   */
  abstract save(quotation: Quotation, expected: QuotationStatus): Promise<Quotation>;
  /** Marks every SENT quotation whose expiry has passed as EXPIRED; returns how many. */
  abstract expireDue(now: Date): Promise<number>;
}
