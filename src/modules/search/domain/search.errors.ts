import { DomainError } from '../../../common/errors/domain-error.js';

export type InvalidSearchReason =
  | 'LOCATION_INCOMPLETE'
  | 'RADIUS_NEEDS_LOCATION'
  | 'DISTANCE_SORT_NEEDS_LOCATION'
  | 'PRICE_RANGE_INVERTED'
  | 'AVAILABLE_ON_OUT_OF_RANGE';

const MESSAGES: Readonly<Record<InvalidSearchReason, string>> = {
  LOCATION_INCOMPLETE: 'lat and lng must be given together',
  RADIUS_NEEDS_LOCATION: 'radiusKm needs lat and lng',
  DISTANCE_SORT_NEEDS_LOCATION: 'sortBy=distance needs lat and lng',
  PRICE_RANGE_INVERTED: 'minPrice must not be greater than maxPrice',
  AVAILABLE_ON_OUT_OF_RANGE: 'availableOn must be a date from today up to one year ahead',
};

/** A search whose parameters are individually valid but do not make sense together. */
export class InvalidSearchQueryError extends DomainError {
  readonly code = 'INVALID_SEARCH_QUERY';
  readonly kind = 'VALIDATION';
  constructor(reason: InvalidSearchReason) {
    super(MESSAGES[reason], { reason });
  }
}
