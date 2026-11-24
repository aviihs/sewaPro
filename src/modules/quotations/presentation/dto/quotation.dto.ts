import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Trim } from '../../../../common/validation/validators.js';
import { QUOTATION_VALIDITY, type Quotation, QuotationStatus } from '../../domain/quotation.js';

const AMOUNT = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 } as const;

export class CreateQuotationRequestDto {
  @ApiProperty({ description: 'Labour cost, NPR', example: 1500, minimum: 0, maximum: 5_000_000 })
  @IsNumber(AMOUNT)
  @Min(0)
  @Max(5_000_000)
  readonly labourCost: number;

  @ApiProperty({
    description: 'Material cost, NPR',
    example: 650.5,
    minimum: 0,
    maximum: 5_000_000,
  })
  @IsNumber(AMOUNT)
  @Min(0)
  @Max(5_000_000)
  readonly materialCost: number;

  @ApiPropertyOptional({
    description: 'What the quote covers',
    example: 'Replace MCB and 3 sockets',
    maxLength: 1000,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 1000)
  readonly note?: string;

  @ApiPropertyOptional({
    description: 'Hours the customer has to accept',
    example: 48,
    minimum: QUOTATION_VALIDITY.minHours,
    maximum: QUOTATION_VALIDITY.maxHours,
    default: QUOTATION_VALIDITY.defaultHours,
  })
  @IsOptional()
  @IsInt()
  @Min(QUOTATION_VALIDITY.minHours)
  @Max(QUOTATION_VALIDITY.maxHours)
  readonly validForHours?: number;
}

export class QuotationResponseDto {
  @ApiProperty({ format: 'uuid', example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' })
  readonly id: string;
  @ApiProperty({ format: 'uuid', example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' })
  readonly bookingId: string;
  @ApiProperty({ description: 'Labour, NPR', example: 1500 }) readonly labourCost: number;
  @ApiProperty({ description: 'Material, NPR', example: 650.5 }) readonly materialCost: number;
  @ApiProperty({ description: 'Labour + material, computed by the server', example: 2150.5 })
  readonly total: number;
  @ApiProperty({ nullable: true, type: String, example: 'Replace MCB' }) readonly note:
    string | null;
  @ApiProperty({ enum: QuotationStatus, example: QuotationStatus.SENT })
  readonly status: QuotationStatus;
  @ApiProperty({ example: '2030-01-08T10:00:00.000Z' }) readonly expiresAt: Date;
  @ApiProperty({ nullable: true, type: Date, example: '2030-01-06T10:00:00.000Z' })
  readonly sentAt: Date | null;
  @ApiProperty({ nullable: true, type: Date, example: null }) readonly respondedAt: Date | null;
  @ApiProperty({ example: '2030-01-06T09:55:00.000Z' }) readonly createdAt: Date;
}

export const toQuotationResponse = (q: Quotation): QuotationResponseDto => ({
  id: q.id,
  bookingId: q.bookingId,
  labourCost: q.labourCost,
  materialCost: q.materialCost,
  total: q.total,
  note: q.note,
  status: q.status,
  expiresAt: q.expiresAt,
  sentAt: q.sentAt,
  respondedAt: q.respondedAt,
  createdAt: q.createdAt,
});
