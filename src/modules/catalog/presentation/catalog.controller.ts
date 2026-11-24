import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/auth.decorators.js';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import {
  ListActiveCategoriesUseCase,
  ListActiveServicesUseCase,
} from '../application/public-catalog.use-cases.js';
import { PublicServicesQueryDto } from './dto/catalog.request.dto.js';
import {
  PublicCategoryResponseDto,
  PublicServiceResponseDto,
  toPublicCategory,
  toPublicService,
} from './dto/catalog.response.dto.js';

/** Public catalog. The full active catalog is small and cached, so lists are not paginated. */
@ApiTags('Catalog')
@Public()
@Controller()
export class CatalogController {
  constructor(
    private readonly listCategories: ListActiveCategoriesUseCase,
    private readonly listServices: ListActiveServicesUseCase,
  ) {}

  @Get('categories')
  @ApiOperation({ summary: 'Active categories with their active services' })
  @ApiEnvelopeResponse(PublicCategoryResponseDto, { description: 'Categories', isArray: true })
  async categories(): Promise<PublicCategoryResponseDto[]> {
    return (await this.listCategories.execute()).map(toPublicCategory);
  }

  @Get('services')
  @ApiOperation({ summary: 'Active services, optionally filtered by category or name' })
  @ApiEnvelopeResponse(PublicServiceResponseDto, { description: 'Services', isArray: true })
  @ApiErrors(400)
  async services(@Query() query: PublicServicesQueryDto): Promise<PublicServiceResponseDto[]> {
    const services = await this.listServices.execute({
      categoryId: query.categoryId,
      search: query.q,
    });
    return services.map(toPublicService);
  }
}
