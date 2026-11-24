import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { NEPAL_BOUNDS } from '../../../../common/validation/nepal-bounds.js';
import { Trim } from '../../../../common/validation/validators.js';

const { minLatitude, maxLatitude, minLongitude, maxLongitude } = NEPAL_BOUNDS;

export class CreateAddressRequestDto {
  @ApiProperty({ description: 'Short label', example: 'Home', minLength: 1, maxLength: 50 })
  @Trim()
  @IsString()
  @Length(1, 50)
  readonly label: string;

  @ApiProperty({
    description: 'Street / house details',
    example: 'House 12, Ward 4, Baluwatar',
    minLength: 3,
    maxLength: 200,
  })
  @Trim()
  @IsString()
  @Length(3, 200)
  readonly line1: string;

  @ApiPropertyOptional({ description: 'Area or tole', example: 'Baluwatar', maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 100)
  readonly area?: string;

  @ApiProperty({ description: 'City', example: 'Kathmandu', minLength: 2, maxLength: 100 })
  @Trim()
  @IsString()
  @Length(2, 100)
  readonly city: string;

  @ApiPropertyOptional({ description: 'District', example: 'Kathmandu', maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 100)
  readonly district?: string;

  @ApiPropertyOptional({
    description: 'Nearby landmark for the provider',
    example: 'Opposite Bhatbhateni',
    maxLength: 200,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 200)
  readonly landmark?: string;

  @ApiProperty({
    description: 'Latitude (must be inside Nepal)',
    example: 27.7215,
    minimum: minLatitude,
    maximum: maxLatitude,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 7 })
  @Min(minLatitude)
  @Max(maxLatitude)
  readonly latitude: number;

  @ApiProperty({
    description: 'Longitude (must be inside Nepal)',
    example: 85.3304,
    minimum: minLongitude,
    maximum: maxLongitude,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 7 })
  @Min(minLongitude)
  @Max(maxLongitude)
  readonly longitude: number;

  @ApiPropertyOptional({
    description: 'Make this the default address (the first address is always default)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly isDefault?: boolean;
}

export class UpdateAddressRequestDto extends PartialType(CreateAddressRequestDto) {}
