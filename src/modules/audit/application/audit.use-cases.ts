import { Injectable } from '@nestjs/common';
import { type Actor, type ActorRole, Role } from '../../../common/auth/role.js';
import { type AuditEntry, AuditTrail } from '../../../common/ports/audit-trail.port.js';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import { type BookingStatusChangedEvent } from '../../bookings/domain/booking.events.js';
import { type DisputeOpenedEvent } from '../../disputes/domain/dispute.js';
import { type QuotationRespondedEvent } from '../../quotations/domain/quotation.events.js';
import {
  AUDITED_BOOKING_STATUSES,
  type AuditLogEntry,
  type AuditLogFilter,
  AuditLogReader,
} from '../domain/audit-log.js';

@Injectable()
export class ListAuditLogsUseCase {
  constructor(private readonly reader: AuditLogReader) {}

  execute(filter: AuditLogFilter, page: PageRequest): Promise<PaginatedResult<AuditLogEntry>> {
    return this.reader.list(filter, page);
  }
}

const ROLES = new Set<string>(Object.values(Role));

/**
 * Events carry who acted but not the HTTP request, so IP/user agent are null
 * for these rows (admin actions are audited in-transaction with full context).
 */
export function eventActor(id: string | null, role: ActorRole): Actor | null {
  if (id === null || !ROLES.has(role)) return null;
  return { id, role: role as Role, context: { ipAddress: null, userAgent: null, requestId: null } };
}

export function bookingAudit({ data }: BookingStatusChangedEvent): AuditEntry | null {
  if (!AUDITED_BOOKING_STATUSES.includes(data.to)) return null;
  return {
    actor: eventActor(data.actorId, data.actorRole),
    action: `booking.${data.to.toLowerCase()}`,
    entityType: 'Booking',
    entityId: data.bookingId,
    before: { status: data.from },
    after: { status: data.to, reason: data.reason, finalAmount: data.finalAmount },
  };
}

export const disputeAudit = ({ data }: DisputeOpenedEvent): AuditEntry => ({
  actor: null,
  action: 'dispute.opened',
  entityType: 'Dispute',
  entityId: data.disputeId,
  after: { bookingId: data.bookingId, raisedByRole: data.raisedByRole, reason: data.reason },
});

/** Acceptance is audited inside its own transaction; declines are recorded here. */
export function quotationAudit({ data }: QuotationRespondedEvent): AuditEntry | null {
  if (data.accepted) return null;
  return {
    actor: eventActor(data.customerId, 'CUSTOMER'),
    action: 'quotation.declined',
    entityType: 'Quotation',
    entityId: data.quotationId,
    after: { status: 'REJECTED', total: data.total },
  };
}

@Injectable()
export class RecordAuditUseCase {
  constructor(private readonly trail: AuditTrail) {}

  async execute(entry: AuditEntry | null): Promise<void> {
    if (entry) await this.trail.record(entry);
  }
}
