import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/auth.decorators.js';
import { type AuthenticatedUser } from '../../../common/auth/role.js';
import {
  ApiCursorPaginatedResponse,
  ApiEnvelopeResponse,
} from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { type CursorPage } from '../../../common/utils/cursor.js';
import {
  CountUnreadNotificationsUseCase,
  ListMyNotificationsUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from '../application/notifications.use-cases.js';
import {
  MarkedReadResponseDto,
  NotificationListQueryDto,
  NotificationResponseDto,
  UnreadCountResponseDto,
  toNotificationResponse,
} from './dto/notification.dto.js';

/** In-app notifications of the signed-in user (any role). */
@ApiTags('Notifications')
@ApiAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly listNotifications: ListMyNotificationsUseCase,
    private readonly countUnread: CountUnreadNotificationsUseCase,
    private readonly markRead: MarkNotificationReadUseCase,
    private readonly markAllRead: MarkAllNotificationsReadUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'My notifications, newest first (cursor pagination: pass meta.nextCursor back as ?cursor)',
  })
  @ApiCursorPaginatedResponse(NotificationResponseDto, 'Notifications')
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationListQueryDto,
  ): Promise<CursorPage<NotificationResponseDto>> {
    const page = await this.listNotifications.execute(user, {
      limit: query.limit,
      cursor: query.cursor,
      unreadOnly: query.unreadOnly ?? false,
    });
    return page.map(toNotificationResponse);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications' })
  @ApiEnvelopeResponse(UnreadCountResponseDto, { description: 'Unread count' })
  async unread(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCountResponseDto> {
    return { unread: await this.countUnread.execute(user) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  @ApiEnvelopeResponse(MarkedReadResponseDto, { description: 'How many were marked' })
  async readAll(@CurrentUser() user: AuthenticatedUser): Promise<MarkedReadResponseDto> {
    return { marked: await this.markAllRead.execute(user) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark one notification as read (idempotent)' })
  @ApiNoContentResponse({ description: 'Marked as read' })
  @ApiErrors(400, 404)
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.markRead.execute(user, id);
  }
}
