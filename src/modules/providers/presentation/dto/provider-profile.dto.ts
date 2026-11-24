import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { NEPAL_BOUNDS } from '../../../../common/validation/nepal-bounds.js';
import { IsNepalLatitude, IsNepalLongitude } from '../../../../common/validation/geo.decorators.js';
import { Trim } from '../../../../common/validation/validators.js';
import { RegisterRequestDto } from '../../../auth/presentation/dto/auth.request.dto.js';
import { type Provider, VerificationStatus } from '../../domain/provider.js';

export class ProviderProfileFieldsDto {
  @ApiPropertyOptional({
    description: 'Business / trade name',
    example: 'Thapa Electricals',
    maxLength: 120,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 120)
  readonly businessName?: string;

  @ApiPropertyOptional({
    description: 'About the provider',
    example: '12 years of residential wiring.',
    maxLength: 1000,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 1000)
  readonly bio?: string;

  @ApiProperty({ description: 'Years of experience', example: 8, minimum: 0, maximum: 70 })
  @IsInt()
  @Min(0)
  @Max(70)
  readonly experienceYears: number;

  @ApiProperty({
    description: 'Base latitude (Nepal)',
    example: 27.7154,
    minimum: NEPAL_BOUNDS.minLatitude,
    maximum: NEPAL_BOUNDS.maxLatitude,
  })
  @IsNepalLatitude()
  readonly latitude: number;

  @ApiProperty({
    description: 'Base longitude (Nepal)',
    example: 85.3123,
    minimum: NEPAL_BOUNDS.minLongitude,
    maximum: NEPAL_BOUNDS.maxLongitude,
  })
  @IsNepalLongitude()
  readonly longitude: number;

  @ApiProperty({
    description: 'How far the provider travels, km',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  readonly serviceRadiusKm: number;
}

export class RegisterProviderRequestDto extends IntersectionType(
  RegisterRequestDto,
  ProviderProfileFieldsDto,
) {}

export class UpdateProviderProfileRequestDto extends PartialType(ProviderProfileFieldsDto) {
  @ApiPropertyOptional({ description: 'Accepting new bookings', example: true })
  @IsOptional()
  @IsBoolean()
  readonly isAvailable?: boolean;
}

export class ProviderProfileResponseDto extends PickType(ProviderProfileFieldsDto, [
  'experienceYears',
  'latitude',
  'longitude',
  'serviceRadiusKm',
] as const) {
  @ApiProperty({
    description: 'Provider id',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  readonly id: string;

  @ApiProperty({
    description: 'Business name',
    example: 'Thapa Electricals',
    nullable: true,
    type: String,
  })
  readonly businessName: string | null;

  @ApiProperty({ description: 'Bio', example: null, nullable: true, type: String })
  readonly bio: string | null;

  @ApiProperty({
    description: 'Verification status',
    enum: VerificationStatus,
    example: VerificationStatus.PENDING_VERIFICATION,
  })
  readonly verificationStatus: VerificationStatus;

  @ApiProperty({
    description: 'Why the last review rejected the profile',
    example: null,
    nullable: true,
    type: String,
  })
  readonly rejectionReason: string | null;

  @ApiProperty({ description: 'When verified', example: null, nullable: true, type: Date })
  readonly verifiedAt: Date | null;

  @ApiProperty({ description: 'Average rating 0-5', example: 4.75 })
  readonly ratingAverage: number;

  @ApiProperty({ description: 'Number of visible reviews', example: 12 })
  readonly ratingCount: number;

  @ApiProperty({ description: 'Completed jobs', example: 40 })
  readonly completedJobs: number;

  @ApiProperty({ description: 'Accepting new bookings', example: true })
  readonly isAvailable: boolean;

  @ApiProperty({ description: 'Registered at', example: '2030-01-01T10:00:00.000Z' })
  readonly createdAt: Date;
}

export const toProviderProfileResponse = (p: Provider): ProviderProfileResponseDto => ({
  id: p.id,
  businessName: p.businessName,
  bio: p.bio,
  experienceYears: p.experienceYears,
  latitude: p.latitude,
  longitude: p.longitude,
  serviceRadiusKm: p.serviceRadiusKm,
  verificationStatus: p.verificationStatus,
  rejectionReason: p.rejectionReason,
  verifiedAt: p.verifiedAt,
  ratingAverage: p.ratingAverage,
  ratingCount: p.ratingCount,
  completedJobs: p.completedJobs,
  isAvailable: p.isAvailable,
  createdAt: p.createdAt,
});
