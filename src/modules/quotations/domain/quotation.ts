import { addRupees } from '../../../common/domain/money.js';
import { InvalidQuotationStateError, QuotationExpiredError } from './quotations.errors.js';

export const QuotationStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus];

export const QUOTATION_VALIDITY = { defaultHours: 48, minHours: 1, maxHours: 168 } as const;

export interface QuotationProps {
  readonly id: string;
  readonly bookingId: string;
  readonly providerId: string;
  readonly labourCost: number;
  readonly materialCost: number;
  readonly total: number;
  readonly note: string | null;
  readonly status: QuotationStatus;
  readonly expiresAt: Date;
  readonly sentAt: Date | null;
  readonly respondedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewQuotation = Pick<
  QuotationProps,
  'bookingId' | 'providerId' | 'labourCost' | 'materialCost' | 'total' | 'note' | 'expiresAt'
>;

/** Builds a draft; the total is always computed here, never taken from the client. */
export function draftQuotation(input: {
  bookingId: string;
  providerId: string;
  labourCost: number;
  materialCost: number;
  note: string | null;
  validForHours: number;
  now: Date;
}): NewQuotation {
  return {
    bookingId: input.bookingId,
    providerId: input.providerId,
    labourCost: input.labourCost,
    materialCost: input.materialCost,
    total: addRupees(input.labourCost, input.materialCost),
    note: input.note,
    expiresAt: new Date(input.now.getTime() + input.validForHours * 3_600_000),
  };
}

/** DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED. */
export class Quotation implements QuotationProps {
  readonly id: string;
  readonly bookingId: string;
  readonly providerId: string;
  readonly labourCost: number;
  readonly materialCost: number;
  readonly total: number;
  readonly note: string | null;
  readonly status: QuotationStatus;
  readonly expiresAt: Date;
  readonly sentAt: Date | null;
  readonly respondedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: QuotationProps) {
    Object.assign(this, props);
  }

  static restore(props: QuotationProps): Quotation {
    return new Quotation(props);
  }

  isExpiredAt(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  send(now: Date): Quotation {
    this.require(QuotationStatus.DRAFT, 'send');
    if (this.isExpiredAt(now)) throw new QuotationExpiredError();
    return this.with({ status: QuotationStatus.SENT, sentAt: now });
  }

  accept(now: Date): Quotation {
    this.require(QuotationStatus.SENT, 'accept');
    if (this.isExpiredAt(now)) throw new QuotationExpiredError();
    return this.with({ status: QuotationStatus.ACCEPTED, respondedAt: now });
  }

  decline(now: Date): Quotation {
    this.require(QuotationStatus.SENT, 'decline');
    return this.with({ status: QuotationStatus.REJECTED, respondedAt: now });
  }

  private require(status: QuotationStatus, action: string): void {
    if (this.status !== status) throw new InvalidQuotationStateError(this.status, action);
  }

  private with(changes: Partial<QuotationProps>): Quotation {
    return new Quotation(Object.assign({}, this, changes));
  }
}
