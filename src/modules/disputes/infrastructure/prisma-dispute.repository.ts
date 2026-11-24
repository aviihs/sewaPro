import { Injectable } from '@nestjs/common';
import { PaginatedResult, type PageRequest, toOffset } from '../../../common/utils/pagination.js';
import {
  type Dispute as DisputeRow,
  type Prisma,
} from '../../../infrastructure/prisma/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  Dispute,
  type DisputeListFilter,
  DisputeRepository,
  type DisputeStatus,
  type NewDispute,
} from '../domain/dispute.js';
import {
  ConcurrentDisputeUpdateError,
  DisputeAlreadyOpenError,
} from '../domain/disputes.errors.js';

const toDispute = (row: DisputeRow): Dispute =>
  Dispute.restore({
    id: row.id,
    bookingId: row.bookingId,
    raisedById: row.raisedById,
    raisedByRole: row.raisedByRole,
    reason: row.reason,
    description: row.description,
    status: row.status,
    outcome: row.outcome,
    resolution: row.resolution,
    resolvedById: row.resolvedById,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  });

@Injectable()
export class PrismaDisputeRepository extends DisputeRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client.dispute;
  }

  async create(dispute: NewDispute): Promise<Dispute> {
    try {
      return toDispute(await this.db.create({ data: dispute }));
    } catch (error) {
      if (isUniqueViolation(error, 'disputes_one_open_per_booking'))
        throw new DisputeAlreadyOpenError();
      throw error;
    }
  }

  async findById(id: string): Promise<Dispute | null> {
    const row = await this.db.findUnique({ where: { id } });
    return row ? toDispute(row) : null;
  }

  async save(dispute: Dispute, expected: DisputeStatus): Promise<Dispute> {
    const { count } = await this.db.updateMany({
      where: { id: dispute.id, status: expected },
      data: {
        status: dispute.status,
        outcome: dispute.outcome,
        resolution: dispute.resolution,
        resolvedById: dispute.resolvedById,
        resolvedAt: dispute.resolvedAt,
      },
    });
    if (count === 0) throw new ConcurrentDisputeUpdateError();
    return toDispute(await this.db.findUniqueOrThrow({ where: { id: dispute.id } }));
  }

  async list(filter: DisputeListFilter, page: PageRequest): Promise<PaginatedResult<Dispute>> {
    const party = filter.partyUserId;
    const where: Prisma.DisputeWhereInput = {
      status: filter.status,
      ...(party
        ? { booking: { OR: [{ customerId: party }, { provider: { userId: party } }] } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toOffset(page),
      }),
      this.db.count({ where }),
    ]);
    return PaginatedResult.of(rows.map(toDispute), total, page);
  }
}
