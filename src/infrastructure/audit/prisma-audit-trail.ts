import { Injectable } from '@nestjs/common';
import { AuditTrail, type AuditEntry } from '../../common/ports/audit-trail.port.js';
import { Prisma } from '../prisma/generated/client.js';
import { PrismaTransactionHost } from '../prisma/prisma-transaction-host.js';

const SECRET_KEYS = /password|token|secret|hash|otp|code/i;

/** Plain JSON copy (Dates → ISO strings) with secret-looking fields removed. */
export function toAuditJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  const json = JSON.stringify(value, (key, v: unknown) =>
    key !== '' && SECRET_KEYS.test(key) ? undefined : v,
  );
  return JSON.parse(json) as Prisma.InputJsonValue;
}

@Injectable()
export class PrismaAuditTrail extends AuditTrail {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  async record(entry: AuditEntry): Promise<void> {
    await this.host.client.auditLog.create({
      data: {
        actorId: entry.actor?.id ?? null,
        actorRole: entry.actor?.role ?? 'SYSTEM',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: toAuditJson(entry.before),
        after: toAuditJson(entry.after),
        ipAddress: entry.actor?.context.ipAddress ?? null,
        userAgent: entry.actor?.context.userAgent ?? null,
        requestId: entry.actor?.context.requestId ?? null,
      },
    });
  }
}
