import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Trim } from '../../../../common/validation/validators.js';
import { PricingType, type ProviderOffering } from '../../domain/offering.js';

export class UpsertOfferingRequestDto {
  @ApiProperty({
    description: 'How the job is priced',
    enum: PricingType,
    example: PricingType.FIXED,
  })
  @IsEnum(PricingType)
  readonly pricingType: PricingType;

  @ApiPropertyOptional({
    description:
      'Price in NPR (required unless pricingType is QUOTATION, where it must be omitted)',
    example: 1500,
    minimum: 1,
    maximum: 10_000_000,
    nullable: true,
    type: Number,
  })
  @ValidateIf((o: UpsertOfferingRequestDto) => o.price !== undefined && o.price !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10_000_000)
  readonly price?: number | null;

  @ApiPropertyOptional({
    description: 'What is included',
    example: 'Includes ceiling hook check',
    maxLength: 500,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 500)
  readonly description?: string;

  @ApiPropertyOptional({ description: 'Currently offered', example: true, default: true })
  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}

export class OfferingResponseDto {
  @ApiProperty({
    description: 'Offering id',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  readonly id: string;

  @ApiProperty({
    description: 'Catalog service id',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  readonly serviceId: string;

  @ApiProperty({ description: 'Service name', example: 'Fan Installation' })
  readonly serviceName: string;

  @ApiProperty({
    description: 'Category id',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  readonly categoryId: string;

  @ApiProperty({ description: 'Pricing type', enum: PricingType, example: PricingType.FIXED })
  readonly pricingType: PricingType;

  @ApiProperty({
    description: 'Price in NPR (null for QUOTATION)',
    example: 1500,
    nullable: true,
    type: Number,
  })
  readonly price: number | null;

  @ApiProperty({ description: 'Description', example: null, nullable: true, type: String })
  readonly description: string | null;

  @ApiProperty({ description: 'Currently offered', example: true })
  readonly isActive: boolean;
}

export const toOfferingResponse = (o: ProviderOffering): OfferingResponseDto => ({
  id: o.id,
  serviceId: o.serviceId,
  serviceName: o.serviceName,
  categoryId: o.categoryId,
  pricingType: o.pricingType,
  price: o.price,
  description: o.description,
  isActive: o.isActive,
});
