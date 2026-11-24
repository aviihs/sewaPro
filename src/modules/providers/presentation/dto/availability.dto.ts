import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../../common/validation/validators.js';
import {
  MAX_WINDOWS_PER_WEEK,
  type BlockedDate,
  type ProviderSettings,
} from '../../domain/availability.js';
import { type AvailabilityView } from '../../application/availability.use-cases.js';

export class AvailabilityWindowDto {
  @ApiProperty({
    description: 'Day of week in Nepal time: 0 = Sunday … 6 = Saturday',
    example: 0,
    minimum: 0,
    maximum: 6,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  readonly dayOfWeek: number;

  @ApiProperty({
    description: 'Start, minutes after local midnight',
    example: 540,
    minimum: 0,
    maximum: 1439,
  })
  @IsInt()
  @Min(0)
  @Max(1439)
  readonly startMinute: number;

  @ApiProperty({
    description: 'End (exclusive), minutes after local midnight; must be after start',
    example: 1080,
    minimum: 1,
    maximum: 1440,
  })
  @IsInt()
  @Min(1)
  @Max(1440)
  readonly endMinute: number;
}

export class ReplaceWindowsRequestDto {
  @ApiProperty({
    type: [AvailabilityWindowDto],
    description: 'The full weekly schedule (replaces the old one)',
    maxItems: MAX_WINDOWS_PER_WEEK,
  })
  @IsArray()
  @ArrayMaxSize(MAX_WINDOWS_PER_WEEK)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  readonly windows: AvailabilityWindowDto[];
}

export class AddBlockedDateRequestDto {
  @ApiProperty({
    description: 'Nepal calendar date to block (YYYY-MM-DD), today or later',
    example: '2030-10-12',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  readonly date: string;

  @ApiPropertyOptional({ description: 'Reason (private)', example: 'Dashain', maxLength: 200 })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 200)
  readonly reason?: string;
}

export class UpdateSettingsRequestDto {
  @ApiPropertyOptional({
    description: 'Maximum bookings per day',
    example: 5,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  readonly maxDailyBookings?: number;

  @ApiPropertyOptional({
    description: 'Length of one booking slot in minutes',
    example: 60,
    minimum: 15,
    maximum: 480,
  })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  readonly slotMinutes?: number;
}

export class BlockedDateResponseDto {
  @ApiProperty({
    description: 'Id',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  readonly id: string;

  @ApiProperty({ description: 'Blocked date', example: '2030-10-12' })
  readonly date: string;

  @ApiProperty({ description: 'Reason', example: 'Dashain', nullable: true, type: String })
  readonly reason: string | null;
}

export class SettingsResponseDto {
  @ApiProperty({ description: 'Maximum bookings per day', example: 5 })
  readonly maxDailyBookings: number;

  @ApiProperty({ description: 'Slot length in minutes', example: 60 })
  readonly slotMinutes: number;
}

export class AvailabilityResponseDto {
  @ApiProperty({ type: [AvailabilityWindowDto] })
  readonly windows: AvailabilityWindowDto[];

  @ApiProperty({ type: [BlockedDateResponseDto], description: 'Upcoming blocked dates' })
  readonly blockedDates: BlockedDateResponseDto[];

  @ApiProperty({ type: SettingsResponseDto })
  readonly settings: SettingsResponseDto;
}

export const toBlockedDateResponse = (b: BlockedDate): BlockedDateResponseDto => ({
  id: b.id,
  date: b.date,
  reason: b.reason,
});
export const toSettingsResponse = (s: ProviderSettings): SettingsResponseDto => ({
  maxDailyBookings: s.maxDailyBookings,
  slotMinutes: s.slotMinutes,
});
export const toAvailabilityResponse = (v: AvailabilityView): AvailabilityResponseDto => ({
  windows: v.windows.map((w) => ({
    dayOfWeek: w.dayOfWeek,
    startMinute: w.startMinute,
    endMinute: w.endMinute,
  })),
  blockedDates: v.blockedDates.map(toBlockedDateResponse),
  settings: toSettingsResponse(v.settings),
});
