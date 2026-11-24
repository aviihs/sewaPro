import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { ActorRole } from '../../../../common/auth/role.js';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto.js';
import { Trim } from '../../../../common/validation/validators.js';
import { type Dispute, DisputeOutcome, DisputeStatus } from '../../domain/dispute.js';

const UUID = '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f';

export class RaiseDisputeRequestDto {
  @ApiProperty({
    description: 'Your booking (IN_PROGRESS, or COMPLETED within 7 days)',
    format: 'uuid',
    example: UUID,
  })
  @IsUUID()
  readonly bookingId: string;

  @ApiProperty({
    description: 'Short reason',
    example: 'Work left unfinished',
    minLength: 5,
    maxLength: 200,
  })
  @Trim()
  @IsString()
  @Length(5, 200)
  readonly reason: string;

  @ApiProperty({
    description: 'What happened',
    example: 'The provider left after fixing only one of three sockets.',
    minLength: 10,
    maxLength: 2000,
  })
  @Trim()
  @IsString()
  @Length(10, 2000)
  readonly description: string;
}

export class DisputeListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: DisputeStatus })
  @IsOptional()
  @IsEnum(DisputeStatus)
  readonly status?: DisputeStatus;
}

export class ResolveDisputeRequestDto {
  @ApiProperty({
    description: 'BOOKING_COMPLETED keeps the job; BOOKING_CANCELLED voids it',
    enum: DisputeOutcome,
    example: DisputeOutcome.BOOKING_COMPLETED,
  })
  @IsEnum(DisputeOutcome)
  readonly outcome: DisputeOutcome;

  @ApiProperty({
    description: 'Decision shown to both parties',
    example: 'Provider returned and finished the job.',
    minLength: 10,
    maxLength: 2000,
  })
  @Trim()
  @IsString()
  @Length(10, 2000)
  readonly resolution: string;

  @ApiPropertyOptional({
    description: 'Final amount, NPR; required to complete a booking disputed before completion',
    example: 1200,
    minimum: 0,
    maximum: 10_000_000,
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  readonly finalAmount?: number;
}

export class DisputeResponseDto {
  @ApiProperty({ format: 'uuid', example: UUID }) readonly id: string;
  @ApiProperty({ format: 'uuid', example: UUID }) readonly bookingId: string;
  @ApiProperty({ enum: ActorRole, example: ActorRole.CUSTOMER }) readonly raisedByRole: ActorRole;
  @ApiProperty({ example: 'Work left unfinished' }) readonly reason: string;
  @ApiProperty({ example: 'The provider left after fixing only one socket.' })
  readonly description: string;
  @ApiProperty({ enum: DisputeStatus, example: DisputeStatus.OPEN }) readonly status: DisputeStatus;
  @ApiProperty({ enum: DisputeOutcome, nullable: true, example: null })
  readonly outcome: DisputeOutcome | null;
  @ApiProperty({ nullable: true, type: String, example: null }) readonly resolution: string | null;
  @ApiProperty({ nullable: true, type: Date, example: null }) readonly resolvedAt: Date | null;
  @ApiProperty({ example: '2030-01-07T12:00:00.000Z' }) readonly createdAt: Date;
}

export const toDisputeResponse = (d: Dispute): DisputeResponseDto => ({
  id: d.id,
  bookingId: d.bookingId,
  raisedByRole: d.raisedByRole,
  reason: d.reason,
  description: d.description,
  status: d.status,
  outcome: d.outcome,
  resolution: d.resolution,
  resolvedAt: d.resolvedAt,
  createdAt: d.createdAt,
});
