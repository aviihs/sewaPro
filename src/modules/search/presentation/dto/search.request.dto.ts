import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto.js';
import { NEPAL_BOUNDS } from '../../../../common/validation/nepal-bounds.js';
import { IsNepalLatitude, IsNepalLongitude } from '../../../../common/validation/geo.decorators.js';
import { ToBoolean, Trim } from '../../../../common/validation/validators.js';
import { MAX_RADIUS_KM, MIN_RADIUS_KM, SearchSort } from '../../domain/search.js';

const MONEY = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 } as const;

export class SearchProvidersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only providers offering a service in this category' })
  @IsOptional()
  @IsUUID()
  readonly categoryId?: string;

  @ApiPropertyOptional({ description: 'Only providers offering this service' })
  @IsOptional()
  @IsUUID()
  readonly serviceId?: string;

  @ApiPropertyOptional({
    description: 'Customer latitude (with lng)',
    example: 27.7172,
    minimum: NEPAL_BOUNDS.minLatitude,
    maximum: NEPAL_BOUNDS.maxLatitude,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNepalLatitude()
  readonly lat?: number;

  @ApiPropertyOptional({
    description: 'Customer longitude (with lat)',
    example: 85.324,
    minimum: NEPAL_BOUNDS.minLongitude,
    maximum: NEPAL_BOUNDS.maxLongitude,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNepalLongitude()
  readonly lng?: number;

  @ApiPropertyOptional({
    description: 'Search radius in km (needs lat/lng). Default 10.',
    example: 10,
    minimum: MIN_RADIUS_KM,
    maximum: MAX_RADIUS_KM,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 1 })
  @Min(MIN_RADIUS_KM)
  @Max(MAX_RADIUS_KM)
  readonly radiusKm?: number;

  @ApiPropertyOptional({
    description: 'Minimum average rating',
    example: 4,
    minimum: 0,
    maximum: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  @Max(5)
  readonly minRating?: number;

  @ApiPropertyOptional({ description: 'Minimum offering price, NPR', example: 500, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  readonly minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum offering price, NPR', example: 3000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  readonly maxPrice?: number;

  @ApiPropertyOptional({ description: 'Minimum years of experience', example: 3, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(70)
  readonly minExperience?: number;

  @ApiPropertyOptional({
    description: 'Search lists verified providers only; `false` is accepted but changes nothing',
    example: true,
    default: true,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly verifiedOnly?: boolean;

  @ApiPropertyOptional({
    description:
      'Works on this Nepal date (YYYY-MM-DD, today up to a year ahead) and has not blocked it',
    example: '2030-01-08',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'availableOn must be YYYY-MM-DD' })
  readonly availableOn?: string;

  @ApiPropertyOptional({
    description: 'Matches business name or service name',
    example: 'wiring',
    maxLength: 100,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 100)
  readonly q?: string;

  @ApiPropertyOptional({
    description: 'Sort order. Default: distance with lat/lng, otherwise rating.',
    enum: Object.values(SearchSort),
  })
  @IsOptional()
  @IsIn(Object.values(SearchSort))
  readonly sortBy?: SearchSort;
}
