import { Injectable } from '@nestjs/common';
import { CursorPage, type CursorRequest, decodeCursor } from '../../../common/utils/cursor.js';
import {
  type Notification as NotificationRow,
  type Prisma,
} from '../../../infrastructure/prisma/generated/client.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type Notification,
  type NotificationData,
  type NotificationDraft,
  NotificationRepository,
} from '../domain/notification.js';

const toNotification = (row: NotificationRow): Notification => ({
  id: row.id,
  userId: row.userId,
  type: row.type,
  title: row.title,
  body: row.body,
  data: (row.data ?? {}) as NotificationData,
  readAt: row.readAt,
  createdAt: row.createdAt,
});

@Injectable()
export class PrismaNotificationRepository extends NotificationRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client.notification;
  }

  async createMany(drafts: readonly NotificationDraft[]): Promise<void> {
    await this.db.createMany({ data: drafts.map((d) => ({ ...d, data: { ...d.data } })) });
  }

  /** Keyset pagination: rows strictly after the cursor in (created_at DESC, id DESC) order. */
  async listForUser(
    userId: string,
    request: CursorRequest & { unreadOnly: boolean },
  ): Promise<CursorPage<Notification>> {
    const after = request.cursor ? decodeCursor(request.cursor) : null;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(request.unreadOnly ? { readAt: null } : {}),
      ...(after
        ? {
            OR: [
              { createdAt: { lt: after.createdAt } },
              { createdAt: after.createdAt, id: { lt: after.id } },
            ],
          }
        : {}),
    };
    const rows = await this.db.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: request.limit + 1,
    });
    return CursorPage.fromRows(rows.map(toNotification), request.limit, (n) => n);
  }

  unreadCount(userId: string): Promise<number> {
    return this.db.count({ where: { userId, readAt: null } });
  }

  async markRead(id: string, userId: string, at: Date): Promise<boolean> {
    const owned = await this.db.findFirst({ where: { id, userId }, select: { readAt: true } });
    if (!owned) return false;
    if (!owned.readAt) await this.db.update({ where: { id }, data: { readAt: at } });
    return true;
  }

  async markAllRead(userId: string, at: Date): Promise<number> {
    const { count } = await this.db.updateMany({
      where: { userId, readAt: null },
      data: { readAt: at },
    });
    return count;
  }
}
