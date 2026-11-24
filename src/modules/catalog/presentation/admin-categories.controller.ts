import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, Roles } from '../../../common/auth/auth.decorators.js';
import { type Actor, Role } from '../../../common/auth/role.js';
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { type PaginatedResult } from '../../../common/utils/pagination.js';
import {
  CreateCategoryUseCase,
  DeleteCategoryUseCase,
  UpdateCategoryUseCase,
} from '../application/category-admin.use-cases.js';
import {
  GetCategoryUseCase,
  ListCategoriesUseCase,
} from '../application/catalog-queries.use-cases.js';
import {
  CatalogListQueryDto,
  CreateCategoryRequestDto,
  UpdateCategoryRequestDto,
} from './dto/catalog.request.dto.js';
import {
  CategoryResponseDto,
  RemovalResponseDto,
  toCategoryResponse,
} from './dto/catalog.response.dto.js';

@ApiTags('Admin: Catalog')
@ApiAuth()
@Roles(Role.ADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(
    private readonly createCategory: CreateCategoryUseCase,
    private readonly updateCategory: UpdateCategoryUseCase,
    private readonly deleteCategory: DeleteCategoryUseCase,
    private readonly listCategories: ListCategoriesUseCase,
    private readonly getCategory: GetCategoryUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a category (slug generated from the name if omitted)' })
  @ApiEnvelopeResponse(CategoryResponseDto, { description: 'Created', status: HttpStatus.CREATED })
  @ApiErrors(400, 409)
  async create(
    @CurrentActor() actor: Actor,
    @Body() body: CreateCategoryRequestDto,
  ): Promise<CategoryResponseDto> {
    return toCategoryResponse(await this.createCategory.execute(actor, body));
  }

  @Get()
  @ApiOperation({ summary: 'List categories, including inactive' })
  @ApiPaginatedResponse(CategoryResponseDto, 'Categories')
  @ApiErrors(400)
  async list(@Query() query: CatalogListQueryDto): Promise<PaginatedResult<CategoryResponseDto>> {
    const page = await this.listCategories.execute(
      { isActive: query.isActive, search: query.q },
      query,
    );
    return page.map(toCategoryResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category' })
  @ApiEnvelopeResponse(CategoryResponseDto, { description: 'Category' })
  @ApiErrors(400, 404)
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryResponseDto> {
    return toCategoryResponse(await this.getCategory.execute(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or (re)activate a category' })
  @ApiEnvelopeResponse(CategoryResponseDto, { description: 'Updated' })
  @ApiErrors(400, 404, 409)
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCategoryRequestDto,
  ): Promise<CategoryResponseDto> {
    return toCategoryResponse(await this.updateCategory.execute(actor, id, body));
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete a category, or deactivate it if providers still offer its services',
  })
  @ApiEnvelopeResponse(RemovalResponseDto, { description: 'Outcome' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RemovalResponseDto> {
    return { id, outcome: await this.deleteCategory.execute(actor, id) };
  }
}
