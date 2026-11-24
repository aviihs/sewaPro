import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../common/utils/pagination.js';
import { ToBoolean } from '../../../../common/validation/validators.js';
import { type Notification, NotificationType } from '../../domain/notification.js';

export class NotificationListQueryDto {
  @ApiPropertyOptional({
    description: `Items per page (max ${MAX_PAGE_SIZE})`,
    example: 20,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  readonly limit: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({
    description: '`meta.nextCursor` from the previous page',
    example: 'MjAzMC0wMS0wN1QxMDowMDowMC4wMDBafDAxOTM',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly cursor?: string;

  @ApiPropertyOptional({ description: 'Only unread notifications', example: false, default: false })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly unreadOnly?: boolean;
}

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid', example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' })
  readonly id: string;
  @ApiProperty({ enum: NotificationType, example: NotificationType.BOOKING_ACCEPTED })
  readonly type: NotificationType;
  @ApiProperty({ example: 'Booking accepted' }) readonly title: string;
  @ApiProperty({ example: 'Your provider accepted the booking.' }) readonly body: string;
  @ApiProperty({
    description: 'Ids for deep links',
    example: { bookingId: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  readonly data: Record<string, string>;
  @ApiProperty({ nullable: true, type: Date, example: null }) readonly readAt: Date | null;
  @ApiProperty({ example: '2030-01-07T04:20:00.000Z' }) readonly createdAt: Date;
}

export class UnreadCountResponseDto {
  @ApiProperty({ example: 3 }) readonly unread: number;
}

export class MarkedReadResponseDto {
  @ApiProperty({ description: 'Notifications that were unread and are now read', example: 3 })
  readonly marked: number;
}

export const toNotificationResponse = (n: Notification): NotificationResponseDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  data: { ...n.data },
  readAt: n.readAt,
  createdAt: n.createdAt,
});
