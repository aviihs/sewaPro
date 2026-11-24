import { Injectable } from '@nestjs/common';
import { type GeoPoint } from '../../../common/geo/distance.js';
import { Clock } from '../../../common/ports/clock.port.js';
import { FileStorage } from '../../../common/ports/file-storage.port.js';
import { isCalendarDate, toNepalTime } from '../../../common/time/nepal-time.js';
import { PaginatedResult, type PageRequest } from '../../../common/utils/pagination.js';
import { ProviderNotFoundError } from '../../providers/domain/providers.errors.js';
import {
  AVAILABLE_ON_HORIZON_DAYS,
  DEFAULT_RADIUS_KM,
  type ProviderSearchFilter,
  type ProviderSearchHit,
  ProviderSearchReader,
  type PublicProviderProfile,
  type SearchDay,
  SearchSort,
} from '../domain/search.js';
import { InvalidSearchQueryError } from '../domain/search.errors.js';

/** Search parameters as the caller gave them; combinations are checked by the use case. */
export interface SearchProvidersQuery extends PageRequest {
  readonly categoryId?: string;
  readonly serviceId?: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly radiusKm?: number;
  readonly minRating?: number;
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly minExperience?: number;
  readonly availableOn?: string;
  readonly q?: string;
  readonly sortBy?: SearchSort;
}

const DAY_MS = 86_400_000;

function originOf(query: SearchProvidersQuery): GeoPoint | undefined {
  if (query.lat === undefined && query.lng === undefined) return undefined;
  if (query.lat === undefined || query.lng === undefined) {
    throw new InvalidSearchQueryError('LOCATION_INCOMPLETE');
  }
  return { latitude: query.lat, longitude: query.lng };
}

/** `date` must be a real date between today and the horizon, both in Nepal time. */
function searchDayOf(date: string, now: Date): SearchDay {
  const today = toNepalTime(now).date;
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
  if (!isCalendarDate(date) || days < 0 || days > AVAILABLE_ON_HORIZON_DAYS) {
    throw new InvalidSearchQueryError('AVAILABLE_ON_OUT_OF_RANGE');
  }
  return { date, dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

/**
 * Public: verified, available providers matching the filters. With a location the
 * result is limited to `radiusKm` (and to each provider's own travel radius) and
 * defaults to nearest first; without one it defaults to best rated first.
 */
@Injectable()
export class SearchProvidersUseCase {
  constructor(
    private readonly reader: ProviderSearchReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: SearchProvidersQuery): Promise<PaginatedResult<ProviderSearchHit>> {
    const filter = this.toFilter(query);
    const { items, totalItems } = await this.reader.search(filter);
    return PaginatedResult.of(items, totalItems, filter.page);
  }

  private toFilter(query: SearchProvidersQuery): ProviderSearchFilter {
    const origin = originOf(query);
    if (!origin && query.radiusKm !== undefined) {
      throw new InvalidSearchQueryError('RADIUS_NEEDS_LOCATION');
    }
    if (!origin && query.sortBy === SearchSort.DISTANCE) {
      throw new InvalidSearchQueryError('DISTANCE_SORT_NEEDS_LOCATION');
    }
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new InvalidSearchQueryError('PRICE_RANGE_INVERTED');
    }
    const q = query.q?.trim();
    return {
      categoryId: query.categoryId,
      serviceId: query.serviceId,
      origin,
      radiusKm: query.radiusKm ?? DEFAULT_RADIUS_KM,
      minRating: query.minRating,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minExperience: query.minExperience,
      availableOn:
        query.availableOn === undefined
          ? undefined
          : searchDayOf(query.availableOn, this.clock.now()),
      q: q === '' ? undefined : q,
      sortBy: query.sortBy ?? (origin ? SearchSort.DISTANCE : SearchSort.RATING),
      page: { page: query.page, limit: query.limit },
    };
  }
}

export interface PublicPortfolioItem {
  readonly id: string;
  readonly url: string;
  readonly caption: string | null;
}

export interface PublicProviderView {
  readonly profile: PublicProviderProfile;
  /** The portfolio in profile order, with public URLs instead of storage keys. */
  readonly portfolio: readonly PublicPortfolioItem[];
}

/** Public: a verified provider's profile, without contact details. Others are 404. */
@Injectable()
export class GetPublicProviderUseCase {
  constructor(
    private readonly reader: ProviderSearchReader,
    private readonly storage: FileStorage,
  ) {}

  async execute(providerId: string): Promise<PublicProviderView> {
    const profile = await this.reader.findPublic(providerId);
    if (!profile) throw new ProviderNotFoundError();
    return {
      profile,
      portfolio: profile.portfolio.map((image) => ({
        id: image.id,
        url: this.storage.publicUrl(image.storageKey),
        caption: image.caption,
      })),
    };
  }
}
