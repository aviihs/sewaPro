import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FixedClock, mockOf, userOf } from '../../../../test/unit/mock.js';
import { PushSender } from '../../../common/ports/messaging.port.js';
import { CursorPage } from '../../../common/utils/cursor.js';
import { NotificationNotFoundError, NotificationRepository } from '../domain/notification.js';
import {
  CountUnreadNotificationsUseCase,
  DispatchNotificationsUseCase,
  ListMyNotificationsUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from './notifications.use-cases.js';

const user = userOf('CUSTOMER', 'cust-1');
const draft = {
  userId: 'cust-1',
  type: 'BOOKING_ACCEPTED' as const,
  title: 'T',
  body: 'B',
  data: {},
};

describe('notification use cases', () => {
  const notifications = mockOf<NotificationRepository>();
  const push = mockOf<PushSender>();
  const clock = new FixedClock();

  it('stores drafts and pushes them, tolerating push failures', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    push.send.mockRejectedValueOnce(new Error('fcm down')).mockResolvedValueOnce(undefined);
    await new DispatchNotificationsUseCase(notifications, push).execute([
      draft,
      { ...draft, userId: 'u2' },
    ]);
    expect(notifications.createMany).toHaveBeenCalledWith([draft, { ...draft, userId: 'u2' }]);
    expect(push.send).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('does nothing for an empty batch', async () => {
    await new DispatchNotificationsUseCase(notifications, push).execute([]);
    expect(notifications.createMany).not.toHaveBeenCalled();
  });

  it('lists and counts the caller notifications', async () => {
    notifications.listForUser.mockResolvedValue(
      CursorPage.fromRows([], 20, () => ({ createdAt: new Date(), id: 'x' })),
    );
    notifications.unreadCount.mockResolvedValue(4);
    await new ListMyNotificationsUseCase(notifications).execute(user, {
      limit: 20,
      unreadOnly: true,
    });
    expect(notifications.listForUser).toHaveBeenCalledWith('cust-1', {
      limit: 20,
      unreadOnly: true,
    });
    await expect(new CountUnreadNotificationsUseCase(notifications).execute(user)).resolves.toBe(4);
  });

  it('marks one as read, or 404 for foreign ids', async () => {
    const useCase = new MarkNotificationReadUseCase(notifications, clock);
    notifications.markRead.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await useCase.execute(user, 'n-1');
    expect(notifications.markRead).toHaveBeenCalledWith('n-1', 'cust-1', clock.now());
    await expect(useCase.execute(user, 'n-2')).rejects.toBeInstanceOf(NotificationNotFoundError);
  });

  it('marks all as read', async () => {
    notifications.markAllRead.mockResolvedValue(3);
    await expect(
      new MarkAllNotificationsReadUseCase(notifications, clock).execute(user),
    ).resolves.toBe(3);
  });
});
