import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto.js';
import { ToBoolean, Trim, TrimLower } from '../../../../common/validation/validators.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MESSAGE = 'slug must be lower-case words separated by single dashes';

export class CreateCategoryRequestDto {
  @ApiProperty({
    description: 'Display name (unique)',
    example: 'Electrician',
    minLength: 2,
    maxLength: 80,
  })
  @Trim()
  @IsString()
  @Length(2, 80)
  readonly name: string;

  @ApiPropertyOptional({
    description: 'URL slug; generated from the name when omitted',
    example: 'electrician',
    pattern: SLUG.source,
    maxLength: 90,
  })
  @IsOptional()
  @TrimLower()
  @IsString()
  @Length(2, 90)
  @Matches(SLUG, { message: SLUG_MESSAGE })
  readonly slug?: string;

  @ApiPropertyOptional({
    description: 'Short description',
    example: 'Wiring, repairs and installations',
    maxLength: 500,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  readonly description?: string;

  @ApiPropertyOptional({
    description: 'HTTPS icon URL',
    example: 'https://cdn.sewapro.com/icons/electrician.svg',
    maxLength: 500,
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  readonly iconUrl?: string;

  @ApiPropertyOptional({
    description: 'Display order (ascending)',
    example: 0,
    minimum: 0,
    maximum: 1000,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  readonly sortOrder?: number;

  @ApiPropertyOptional({ description: 'Visible to customers', example: true, default: true })
  @IsOptional()
  @IsBoolean()
  readonly isActive?: boolean;
}

export class UpdateCategoryRequestDto extends PartialType(CreateCategoryRequestDto) {}

export class CreateServiceRequestDto extends OmitType(CreateCategoryRequestDto, [
  'iconUrl',
  'sortOrder',
  'name',
] as const) {
  @ApiProperty({
    description: 'Category the service belongs to',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  @IsUUID()
  readonly categoryId: string;

  @ApiProperty({
    description: 'Display name (unique within the category)',
    example: 'Fan Installation',
    minLength: 2,
    maxLength: 100,
  })
  @Trim()
  @IsString()
  @Length(2, 100)
  readonly name: string;
}

export class UpdateServiceRequestDto extends PartialType(CreateServiceRequestDto) {}

export class CatalogListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active flag', example: true })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Case-insensitive name search',
    example: 'elec',
    maxLength: 80,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 80)
  readonly q?: string;
}

export class ServiceListQueryDto extends CatalogListQueryDto {
  @ApiPropertyOptional({ description: 'Only services of this category', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  readonly categoryId?: string;
}

export class PublicServicesQueryDto {
  @ApiPropertyOptional({ description: 'Only services of this category', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  readonly categoryId?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive name search',
    example: 'fan',
    maxLength: 80,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 80)
  readonly q?: string;
}
