import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto.js';
import { Trim } from '../../../../common/validation/validators.js';
import { BookingStatus } from '../../domain/booking-state-machine.js';

const UUID = '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f';

export class CreateBookingRequestDto {
  @ApiProperty({ description: 'Verified provider to book', format: 'uuid', example: UUID })
  @IsUUID()
  readonly providerId: string;

  @ApiProperty({
    description: 'Catalog service the provider offers',
    format: 'uuid',
    example: UUID,
  })
  @IsUUID()
  readonly serviceId: string;

  @ApiProperty({
    description: 'One of your saved addresses (copied into the booking)',
    format: 'uuid',
    example: UUID,
  })
  @IsUUID()
  readonly addressId: string;

  @ApiProperty({
    description:
      'Start time, ISO 8601 with offset; at least 30 minutes ahead, at most 60 days, inside the provider schedule',
    example: '2030-01-07T10:00:00+05:45',
    type: String,
    format: 'date-time',
  })
  @Type(() => Date)
  @IsDate()
  readonly scheduledAt: Date;

  @ApiPropertyOptional({
    description: 'What needs fixing',
    example: 'Ceiling fan wobbles and makes noise',
    maxLength: 2000,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 2000)
  readonly problemDescription?: string;
}

export class BookingListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  readonly status?: BookingStatus;

  @ApiPropertyOptional({
    description: 'Scheduled at or after (ISO 8601)',
    example: '2030-01-01T00:00:00Z',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  readonly from?: Date;

  @ApiPropertyOptional({
    description: 'Scheduled before (ISO 8601)',
    example: '2030-02-01T00:00:00Z',
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  readonly to?: Date;
}

export class CancelBookingRequestDto {
  @ApiPropertyOptional({
    description: 'Why you are cancelling',
    example: 'Fixed it myself',
    maxLength: 500,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 500)
  readonly reason?: string;
}

export class RejectBookingRequestDto {
  @ApiProperty({
    description: 'Shown to the customer',
    example: 'Fully booked that afternoon',
    minLength: 3,
    maxLength: 500,
  })
  @Trim()
  @IsString()
  @Length(3, 500)
  readonly reason: string;
}

export class CompleteBookingRequestDto {
  @ApiProperty({
    description: 'Amount charged for the job, NPR (2 decimals max)',
    example: 1800,
    minimum: 0,
    maximum: 10_000_000,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  readonly finalAmount: number;
}
