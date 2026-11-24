import { type Actor } from '../auth/role.js';

export interface AuditEntry {
  /** Who did it; null for system jobs. */
  readonly actor: Actor | null;
  /** Dotted verb, e.g. `provider.verified`, `category.deleted`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
}

/**
 * Append-only audit log. Called inside the use case's unit of work, so the
 * audit row commits (or rolls back) together with the change it describes.
 */
export abstract class AuditTrail {
  abstract record(entry: AuditEntry): Promise<void>;
}
