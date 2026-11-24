import { Injectable } from '@nestjs/common';
import {
  CategoryRepository,
  ServiceRepository,
} from '../../catalog/domain/catalog.repositories.js';
import { type OfferingInput, type ProviderOffering, validatePricing } from '../domain/offering.js';
import { OfferingRepository, ProviderRepository } from '../domain/provider.repositories.js';
import {
  OfferingNotFoundError,
  ServiceUnavailableForOfferingError,
} from '../domain/providers.errors.js';
import { requireOwnProvider } from './provider-access.js';

@Injectable()
export class ListMyOfferingsUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly offerings: OfferingRepository,
  ) {}

  async execute(userId: string): Promise<ProviderOffering[]> {
    const provider = await requireOwnProvider(this.providers, userId);
    return this.offerings.listByProvider(provider.id);
  }
}

/** Adds a catalog service to the provider's offer, or updates its pricing. */
@Injectable()
export class UpsertMyOfferingUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly offerings: OfferingRepository,
    private readonly services: ServiceRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(
    userId: string,
    serviceId: string,
    input: OfferingInput,
  ): Promise<ProviderOffering> {
    const provider = await requireOwnProvider(this.providers, userId);
    validatePricing(input.pricingType, input.price);
    const service = await this.services.findById(serviceId);
    const category = service ? await this.categories.findById(service.categoryId) : null;
    if (!service?.isActive || !category?.isActive) throw new ServiceUnavailableForOfferingError();
    return this.offerings.upsert(provider.id, serviceId, input);
  }
}

@Injectable()
export class RemoveMyOfferingUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly offerings: OfferingRepository,
  ) {}

  async execute(userId: string, serviceId: string): Promise<void> {
    const provider = await requireOwnProvider(this.providers, userId);
    if (!(await this.offerings.remove(provider.id, serviceId))) throw new OfferingNotFoundError();
  }
}
