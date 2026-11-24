import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/auth.decorators.js';
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { type PaginatedResult } from '../../../common/utils/pagination.js';
import {
  GetPublicProviderUseCase,
  SearchProvidersUseCase,
} from '../application/search.use-cases.js';
import { SearchProvidersQueryDto } from './dto/search.request.dto.js';
import {
  ProviderSearchHitResponseDto,
  PublicProviderResponseDto,
  toPublicProviderResponse,
  toSearchHitResponse,
} from './dto/search.response.dto.js';

/**
 * Public provider discovery. Registered after the providers module so the static
 * `providers/me…` routes win over `providers/:id`.
 */
@ApiTags('Search')
@Public()
@Controller('providers')
export class SearchController {
  constructor(
    private readonly searchProviders: SearchProvidersUseCase,
    private readonly getPublicProvider: GetPublicProviderUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Search verified, available providers (nearby with lat/lng)',
    description:
      'Filters combine with AND. With lat/lng, only providers within radiusKm whose own ' +
      'travel radius covers the customer are listed, and each hit has distanceKm.',
  })
  @ApiPaginatedResponse(ProviderSearchHitResponseDto, 'Matching providers')
  @ApiErrors(400)
  async search(
    @Query() query: SearchProvidersQueryDto,
  ): Promise<PaginatedResult<ProviderSearchHitResponseDto>> {
    const result = await this.searchProviders.execute({
      categoryId: query.categoryId,
      serviceId: query.serviceId,
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm,
      minRating: query.minRating,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minExperience: query.minExperience,
      availableOn: query.availableOn,
      q: query.q,
      sortBy: query.sortBy,
      page: query.page,
      limit: query.limit,
    });
    return result.map(toSearchHitResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Public profile of a verified provider (no contact details)' })
  @ApiEnvelopeResponse(PublicProviderResponseDto, { description: 'Provider' })
  @ApiErrors(400, 404)
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<PublicProviderResponseDto> {
    return toPublicProviderResponse(await this.getPublicProvider.execute(id));
  }
}
