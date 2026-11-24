import { DomainError } from '../../../common/errors/domain-error.js';
import { type CursorPage, type CursorRequest } from '../../../common/utils/cursor.js';

export const NotificationType = {
  BOOKING_CREATED: 'BOOKING_CREATED',
  BOOKING_ACCEPTED: 'BOOKING_ACCEPTED',
  BOOKING_REJECTED: 'BOOKING_REJECTED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_STATUS_CHANGED: 'BOOKING_STATUS_CHANGED',
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  QUOTATION_SENT: 'QUOTATION_SENT',
  QUOTATION_RESPONDED: 'QUOTATION_RESPONDED',
  REVIEW_RECEIVED: 'REVIEW_RECEIVED',
  DISPUTE_OPENED: 'DISPUTE_OPENED',
  DISPUTE_RESOLVED: 'DISPUTE_RESOLVED',
  PROVIDER_VERIFIED: 'PROVIDER_VERIFIED',
  PROVIDER_REJECTED: 'PROVIDER_REJECTED',
  PROVIDER_SUSPENDED: 'PROVIDER_SUSPENDED',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** Ids that let a client deep-link (booking, quotation, review, dispute). */
export type NotificationData = Readonly<Record<string, string>>;

export interface NotificationDraft {
  readonly userId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly data: NotificationData;
}

export interface Notification extends NotificationDraft {
  readonly id: string;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export abstract class NotificationRepository {
  abstract createMany(drafts: readonly NotificationDraft[]): Promise<void>;
  /** Newest first, keyset-paginated on (created_at, id). */
  abstract listForUser(
    userId: string,
    request: CursorRequest & { unreadOnly: boolean },
  ): Promise<CursorPage<Notification>>;
  abstract unreadCount(userId: string): Promise<number>;
  /** False when the notification does not exist or belongs to someone else. */
  abstract markRead(id: string, userId: string, at: Date): Promise<boolean>;
  abstract markAllRead(userId: string, at: Date): Promise<number>;
}

export class NotificationNotFoundError extends DomainError {
  readonly code = 'NOTIFICATION_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Notification not found');
  }
}
