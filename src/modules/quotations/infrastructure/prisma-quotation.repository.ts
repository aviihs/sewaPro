import { Injectable } from '@nestjs/common';
import { type Quotation as QuotationRow } from '../../../infrastructure/prisma/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import { type NewQuotation, Quotation, type QuotationStatus } from '../domain/quotation.js';
import { QuotationRepository } from '../domain/quotation.repository.js';
import {
  ConcurrentQuotationUpdateError,
  QuotationAlreadyOpenError,
} from '../domain/quotations.errors.js';

const toQuotation = (row: QuotationRow): Quotation =>
  Quotation.restore({
    id: row.id,
    bookingId: row.bookingId,
    providerId: row.providerId,
    labourCost: row.labourCost.toNumber(),
    materialCost: row.materialCost.toNumber(),
    total: row.total.toNumber(),
    note: row.note,
    status: row.status,
    expiresAt: row.expiresAt,
    sentAt: row.sentAt,
    respondedAt: row.respondedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

@Injectable()
export class PrismaQuotationRepository extends QuotationRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client.quotation;
  }

  async create(quotation: NewQuotation): Promise<Quotation> {
    try {
      return toQuotation(await this.db.create({ data: quotation }));
    } catch (error) {
      if (isUniqueViolation(error, 'quotations_one_open_per_booking'))
        throw new QuotationAlreadyOpenError();
      throw error;
    }
  }

  async findById(id: string): Promise<Quotation | null> {
    const row = await this.db.findUnique({ where: { id } });
    return row ? toQuotation(row) : null;
  }

  async listForBooking(bookingId: string, includeDrafts: boolean): Promise<Quotation[]> {
    const rows = await this.db.findMany({
      where: { bookingId, ...(includeDrafts ? {} : { status: { not: 'DRAFT' } }) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toQuotation);
  }

  async save(quotation: Quotation, expected: QuotationStatus): Promise<Quotation> {
    const { count } = await this.db.updateMany({
      where: { id: quotation.id, status: expected },
      data: {
        status: quotation.status,
        sentAt: quotation.sentAt,
        respondedAt: quotation.respondedAt,
      },
    });
    if (count === 0) throw new ConcurrentQuotationUpdateError();
    return toQuotation(await this.db.findUniqueOrThrow({ where: { id: quotation.id } }));
  }

  async expireDue(now: Date): Promise<number> {
    const { count } = await this.db.updateMany({
      where: { status: 'SENT', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    return count;
  }
}
