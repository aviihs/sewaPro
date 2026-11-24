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
  GetServiceUseCase,
  ListServicesUseCase,
} from '../application/catalog-queries.use-cases.js';
import {
  CreateServiceUseCase,
  DeleteServiceUseCase,
  UpdateServiceUseCase,
} from '../application/service-admin.use-cases.js';
import {
  CreateServiceRequestDto,
  ServiceListQueryDto,
  UpdateServiceRequestDto,
} from './dto/catalog.request.dto.js';
import {
  RemovalResponseDto,
  ServiceResponseDto,
  toServiceResponse,
} from './dto/catalog.response.dto.js';

@ApiTags('Admin: Catalog')
@ApiAuth()
@Roles(Role.ADMIN)
@Controller('admin/services')
export class AdminServicesController {
  constructor(
    private readonly createService: CreateServiceUseCase,
    private readonly updateService: UpdateServiceUseCase,
    private readonly deleteService: DeleteServiceUseCase,
    private readonly listServices: ListServicesUseCase,
    private readonly getService: GetServiceUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a service in a category' })
  @ApiEnvelopeResponse(ServiceResponseDto, { description: 'Created', status: HttpStatus.CREATED })
  @ApiErrors(400, 404, 409)
  async create(
    @CurrentActor() actor: Actor,
    @Body() body: CreateServiceRequestDto,
  ): Promise<ServiceResponseDto> {
    return toServiceResponse(await this.createService.execute(actor, body));
  }

  @Get()
  @ApiOperation({ summary: 'List services, including inactive' })
  @ApiPaginatedResponse(ServiceResponseDto, 'Services')
  @ApiErrors(400)
  async list(@Query() query: ServiceListQueryDto): Promise<PaginatedResult<ServiceResponseDto>> {
    const filter = { isActive: query.isActive, search: query.q, categoryId: query.categoryId };
    return (await this.listServices.execute(filter, query)).map(toServiceResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a service' })
  @ApiEnvelopeResponse(ServiceResponseDto, { description: 'Service' })
  @ApiErrors(400, 404)
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceResponseDto> {
    return toServiceResponse(await this.getService.execute(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update, move or (re)activate a service' })
  @ApiEnvelopeResponse(ServiceResponseDto, { description: 'Updated' })
  @ApiErrors(400, 404, 409)
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateServiceRequestDto,
  ): Promise<ServiceResponseDto> {
    return toServiceResponse(await this.updateService.execute(actor, id, body));
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete a service, or deactivate it while providers still offer it',
  })
  @ApiEnvelopeResponse(RemovalResponseDto, { description: 'Outcome' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RemovalResponseDto> {
    return { id, outcome: await this.deleteService.execute(actor, id) };
  }
}
