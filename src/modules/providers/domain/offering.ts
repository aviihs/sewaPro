import { InvalidPricingError } from './providers.errors.js';

export const PricingType = {
  FIXED: 'FIXED',
  HOURLY: 'HOURLY',
  STARTING_FROM: 'STARTING_FROM',
  QUOTATION: 'QUOTATION',
} as const;

export type PricingType = (typeof PricingType)[keyof typeof PricingType];

/** A catalog service a provider offers, with their pricing. Prices are in NPR. */
export interface ProviderOffering {
  readonly id: string;
  readonly providerId: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly categoryId: string;
  readonly pricingType: PricingType;
  readonly price: number | null;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OfferingInput {
  readonly pricingType: PricingType;
  readonly price: number | null;
  readonly description: string | null;
  readonly isActive: boolean;
}

/** QUOTATION has no upfront price (the provider quotes per job); every other type needs one. */
export function validatePricing(pricingType: PricingType, price: number | null): void {
  if (pricingType === PricingType.QUOTATION) {
    if (price !== null)
      throw new InvalidPricingError(pricingType, 'QUOTATION pricing must not have a price');
    return;
  }
  if (price === null || price <= 0) {
    throw new InvalidPricingError(pricingType, `${pricingType} pricing requires a positive price`);
  }
}
