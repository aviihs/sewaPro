import { Module } from '@nestjs/common';
import {
  CountUnreadNotificationsUseCase,
  DispatchNotificationsUseCase,
  ListMyNotificationsUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from './application/notifications.use-cases.js';
import { NotificationRepository } from './domain/notification.js';
import { PrismaNotificationRepository } from './infrastructure/prisma-notification.repository.js';
import { NotificationListeners } from './presentation/notification.listeners.js';
import { NotificationsController } from './presentation/notifications.controller.js';

@Module({
  controllers: [NotificationsController],
  providers: [
    { provide: NotificationRepository, useClass: PrismaNotificationRepository },
    DispatchNotificationsUseCase,
    ListMyNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    MarkNotificationReadUseCase,
    MarkAllNotificationsReadUseCase,
    NotificationListeners,
  ],
})
export class NotificationsModule {}
