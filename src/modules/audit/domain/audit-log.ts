import { type ActorRole } from '../../../common/auth/role.js';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';

export interface AuditLogEntry {
  readonly id: string;
  readonly actorId: string | null;
  readonly actorRole: ActorRole | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly requestId: string | null;
  readonly createdAt: Date;
}

export interface AuditLogFilter {
  readonly actorId?: string;
  readonly action?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly from?: Date;
  readonly to?: Date;
}

/** Read side of the audit log (writes go through the `AuditTrail` port). */
export abstract class AuditLogReader {
  abstract list(filter: AuditLogFilter, page: PageRequest): Promise<PaginatedResult<AuditLogEntry>>;
}

/** Booking transitions worth an audit row when they happen outside admin endpoints. */
export const AUDITED_BOOKING_STATUSES: readonly string[] = [
  'CANCELLED',
  'REJECTED',
  'COMPLETED',
  'DISPUTED',
];
