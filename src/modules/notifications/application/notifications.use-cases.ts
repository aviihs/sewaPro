import { Injectable, Logger } from '@nestjs/common';
import { type AuthenticatedUser } from '../../../common/auth/role.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { PushSender } from '../../../common/ports/messaging.port.js';
import { type CursorPage, type CursorRequest } from '../../../common/utils/cursor.js';
import {
  type Notification,
  type NotificationDraft,
  NotificationNotFoundError,
  NotificationRepository,
} from '../domain/notification.js';

/** Stores in-app notifications and forwards them to push (best effort). */
@Injectable()
export class DispatchNotificationsUseCase {
  private readonly logger = new Logger(DispatchNotificationsUseCase.name);

  constructor(
    private readonly notifications: NotificationRepository,
    private readonly push: PushSender,
  ) {}

  async execute(drafts: readonly NotificationDraft[]): Promise<void> {
    if (drafts.length === 0) return;
    await this.notifications.createMany(drafts);
    for (const draft of drafts) {
      try {
        await this.push.send(draft.userId, draft.title, draft.body);
      } catch (error) {
        this.logger.warn({ err: error, type: draft.type }, 'Push delivery failed');
      }
    }
  }
}

@Injectable()
export class ListMyNotificationsUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  execute(
    user: AuthenticatedUser,
    request: CursorRequest & { unreadOnly: boolean },
  ): Promise<CursorPage<Notification>> {
    return this.notifications.listForUser(user.id, request);
  }
}

@Injectable()
export class CountUnreadNotificationsUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  execute(user: AuthenticatedUser): Promise<number> {
    return this.notifications.unreadCount(user.id);
  }
}

/** Idempotent; another user's notification is reported as not found. */
@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(user: AuthenticatedUser, notificationId: string): Promise<void> {
    const found = await this.notifications.markRead(notificationId, user.id, this.clock.now());
    if (!found) throw new NotificationNotFoundError();
  }
}

@Injectable()
export class MarkAllNotificationsReadUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  execute(user: AuthenticatedUser): Promise<number> {
    return this.notifications.markAllRead(user.id, this.clock.now());
  }
}
