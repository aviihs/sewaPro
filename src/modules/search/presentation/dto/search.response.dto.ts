import { ApiProperty } from '@nestjs/swagger';
import { PricingType } from '../../../providers/domain/offering.js';
import { type PublicOffering, type ProviderSearchHit } from '../../domain/search.js';
import { type PublicProviderView } from '../../application/search.use-cases.js';

export class PublicOfferingResponseDto {
  @ApiProperty({ format: 'uuid' }) readonly serviceId: string;
  @ApiProperty({ example: 'Fan Installation' }) readonly serviceName: string;
  @ApiProperty({ format: 'uuid' }) readonly categoryId: string;
  @ApiProperty({ example: 'Electrician' }) readonly categoryName: string;
  @ApiProperty({ enum: Object.values(PricingType), example: 'FIXED' })
  readonly pricingType: PricingType;
  @ApiProperty({ type: Number, nullable: true, example: 1500, description: 'NPR' })
  readonly price: number | null;
}

export class ProviderSearchHitResponseDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ example: 'Thapa Electricals' }) readonly displayName: string;
  @ApiProperty({ example: 4.6 }) readonly ratingAverage: number;
  @ApiProperty({ example: 23 }) readonly ratingCount: number;
  @ApiProperty({ example: 8 }) readonly experienceYears: number;
  @ApiProperty({ example: 41 }) readonly completedJobs: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1500,
    description: 'Lowest price among the matching offerings (null if all are quotation-priced)',
  })
  readonly minPrice: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2.35,
    description: 'Distance from lat/lng in km; null without a location',
  })
  readonly distanceKm: number | null;
  @ApiProperty({ type: [PublicOfferingResponseDto], description: 'Matching offerings' })
  readonly services: PublicOfferingResponseDto[];
}

export class WeeklyHoursResponseDto {
  @ApiProperty({ example: 1, description: '0 = Sunday … 6 = Saturday' }) readonly dayOfWeek: number;
  @ApiProperty({ example: 360, description: 'Minutes from midnight, Nepal time' })
  readonly startMinute: number;
  @ApiProperty({ example: 1200 }) readonly endMinute: number;
}

export class PublicPortfolioImageResponseDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ example: 'http://localhost:3000/api/v1/files/public/portfolio/abc.jpg' })
  readonly url: string;
  @ApiProperty({ type: String, nullable: true }) readonly caption: string | null;
}

export class PublicProviderResponseDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ example: 'Thapa Electricals' }) readonly displayName: string;
  @ApiProperty({ type: String, nullable: true }) readonly bio: string | null;
  @ApiProperty({ example: 8 }) readonly experienceYears: number;
  @ApiProperty({ example: 4.6 }) readonly ratingAverage: number;
  @ApiProperty({ example: 23 }) readonly ratingCount: number;
  @ApiProperty({ example: 41 }) readonly completedJobs: number;
  @ApiProperty({ example: 10 }) readonly serviceRadiusKm: number;
  @ApiProperty({ example: true, description: 'Accepting new bookings' })
  readonly isAvailable: boolean;
  @ApiProperty({ type: Date, nullable: true }) readonly verifiedAt: Date | null;
  @ApiProperty() readonly memberSince: Date;
  @ApiProperty({ type: [PublicOfferingResponseDto] })
  readonly services: PublicOfferingResponseDto[];
  @ApiProperty({ type: [PublicPortfolioImageResponseDto] })
  readonly portfolio: PublicPortfolioImageResponseDto[];
  @ApiProperty({ type: [WeeklyHoursResponseDto] }) readonly weeklyHours: WeeklyHoursResponseDto[];
}

const toOffering = (o: PublicOffering): PublicOfferingResponseDto => ({
  serviceId: o.serviceId,
  serviceName: o.serviceName,
  categoryId: o.categoryId,
  categoryName: o.categoryName,
  pricingType: o.pricingType,
  price: o.price,
});

export const toSearchHitResponse = (hit: ProviderSearchHit): ProviderSearchHitResponseDto => ({
  id: hit.providerId,
  displayName: hit.displayName,
  ratingAverage: hit.ratingAverage,
  ratingCount: hit.ratingCount,
  experienceYears: hit.experienceYears,
  completedJobs: hit.completedJobs,
  minPrice: hit.minPrice,
  distanceKm: hit.distanceKm,
  services: hit.services.map(toOffering),
});

export const toPublicProviderResponse = ({
  profile,
  portfolio,
}: PublicProviderView): PublicProviderResponseDto => ({
  id: profile.id,
  displayName: profile.displayName,
  bio: profile.bio,
  experienceYears: profile.experienceYears,
  ratingAverage: profile.ratingAverage,
  ratingCount: profile.ratingCount,
  completedJobs: profile.completedJobs,
  serviceRadiusKm: profile.serviceRadiusKm,
  isAvailable: profile.isAvailable,
  verifiedAt: profile.verifiedAt,
  memberSince: profile.memberSince,
  services: profile.services.map(toOffering),
  portfolio: portfolio.map((image) => ({ id: image.id, url: image.url, caption: image.caption })),
  weeklyHours: profile.weeklyHours.map((w) => ({
    dayOfWeek: w.dayOfWeek,
    startMinute: w.startMinute,
    endMinute: w.endMinute,
  })),
});
