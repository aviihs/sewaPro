import { type GeoPoint } from '../../../common/geo/distance.js';
import { type PageRequest } from '../../../common/utils/pagination.js';
import { type AvailabilityWindow } from '../../providers/domain/availability.js';
import { type PricingType } from '../../providers/domain/offering.js';

export const SearchSort = {
  DISTANCE: 'distance',
  RATING: 'rating',
  PRICE: 'price',
} as const;
export type SearchSort = (typeof SearchSort)[keyof typeof SearchSort];

export const DEFAULT_RADIUS_KM = 10;
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 50;
/** `availableOn` may be at most this many days ahead (matches the blocked-date horizon). */
export const AVAILABLE_ON_HORIZON_DAYS = 365;

/** A Nepal calendar date with its weekday (0 = Sunday), used to match weekly windows. */
export interface SearchDay {
  readonly date: string;
  readonly dayOfWeek: number;
}

/** A validated search: every field is ready to be turned into SQL. */
export interface ProviderSearchFilter {
  readonly categoryId?: string;
  readonly serviceId?: string;
  /** Customer location. When set, results are limited to `radiusKm` and carry a distance. */
  readonly origin?: GeoPoint;
  readonly radiusKm: number;
  readonly minRating?: number;
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly minExperience?: number;
  readonly availableOn?: SearchDay;
  readonly q?: string;
  readonly sortBy: SearchSort;
  readonly page: PageRequest;
}

/** One active offering of a provider, as shown to customers. */
export interface PublicOffering {
  readonly serviceId: string;
  readonly serviceName: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly pricingType: PricingType;
  readonly price: number | null;
}

export interface ProviderSearchHit {
  readonly providerId: string;
  readonly displayName: string;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly experienceYears: number;
  readonly completedJobs: number;
  /** Lowest priced matching offering; null when every match is quotation-priced. */
  readonly minPrice: number | null;
  /** Null when the search had no location. */
  readonly distanceKm: number | null;
  /** The provider's offerings that matched the filters. */
  readonly services: readonly PublicOffering[];
}

export interface PublicPortfolioImage {
  readonly id: string;
  readonly storageKey: string;
  readonly caption: string | null;
}

/** What anyone may see about a verified provider: no phone, email or exact location. */
export interface PublicProviderProfile {
  readonly id: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly experienceYears: number;
  readonly ratingAverage: number;
  readonly ratingCount: number;
  readonly completedJobs: number;
  readonly serviceRadiusKm: number;
  readonly isAvailable: boolean;
  readonly verifiedAt: Date | null;
  readonly memberSince: Date;
  readonly services: readonly PublicOffering[];
  readonly portfolio: readonly PublicPortfolioImage[];
  readonly weeklyHours: readonly AvailabilityWindow[];
}

export interface ProviderSearchPage {
  readonly items: readonly ProviderSearchHit[];
  readonly totalItems: number;
}

/** Read-only port over the provider catalogue for customers. */
export abstract class ProviderSearchReader {
  abstract search(filter: ProviderSearchFilter): Promise<ProviderSearchPage>;
  /** A verified provider whose account is not suspended, or null. */
  abstract findPublic(providerId: string): Promise<PublicProviderProfile | null>;
}
