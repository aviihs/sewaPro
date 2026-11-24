import { Injectable } from '@nestjs/common';
import { PaginatedResult, type PageRequest, toOffset } from '../../../common/utils/pagination.js';
import { type Prisma } from '../../../infrastructure/prisma/generated/client.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import { type AuditLogEntry, type AuditLogFilter, AuditLogReader } from '../domain/audit-log.js';

/** Every filter maps onto an index: (action, created_at), (actor_id, created_at), (entity_type, entity_id, created_at). */
@Injectable()
export class PrismaAuditLogReader extends AuditLogReader {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  async list(filter: AuditLogFilter, page: PageRequest): Promise<PaginatedResult<AuditLogEntry>> {
    const where: Prisma.AuditLogWhereInput = {
      actorId: filter.actorId,
      action: filter.action,
      entityType: filter.entityType,
      entityId: filter.entityId,
      ...(filter.from || filter.to ? { createdAt: { gte: filter.from, lt: filter.to } } : {}),
    };
    const db = this.host.client.auditLog;
    const [rows, total] = await Promise.all([
      db.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...toOffset(page) }),
      db.count({ where }),
    ]);
    return PaginatedResult.of(rows, total, page);
  }
}
