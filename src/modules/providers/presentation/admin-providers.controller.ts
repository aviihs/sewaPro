import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  GetProviderForAdminUseCase,
  ListProviderDocumentsForAdminUseCase,
  ListProvidersForAdminUseCase,
} from '../application/admin-providers.queries.js';
import {
  RejectProviderUseCase,
  SuspendProviderUseCase,
  VerifyProviderUseCase,
} from '../application/admin-verification.use-cases.js';
import {
  AdminProviderDetailResponseDto,
  AdminProviderQueryDto,
  AdminProviderSummaryResponseDto,
  ReasonRequestDto,
  toAdminDetailResponse,
  toAdminSummaryResponse,
} from './dto/admin-provider.dto.js';
import { DocumentResponseDto, toDocumentResponse } from './dto/media.dto.js';
import {
  ProviderProfileResponseDto,
  toProviderProfileResponse,
} from './dto/provider-profile.dto.js';

@ApiTags('Admin: Providers')
@ApiAuth()
@Roles(Role.ADMIN)
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(
    private readonly listProviders: ListProvidersForAdminUseCase,
    private readonly getProvider: GetProviderForAdminUseCase,
    private readonly listDocuments: ListProviderDocumentsForAdminUseCase,
    private readonly verifyProvider: VerifyProviderUseCase,
    private readonly rejectProvider: RejectProviderUseCase,
    private readonly suspendProvider: SuspendProviderUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Providers by verification status (oldest submission first)' })
  @ApiPaginatedResponse(AdminProviderSummaryResponseDto, 'Providers')
  @ApiErrors(400)
  async list(
    @Query() query: AdminProviderQueryDto,
  ): Promise<PaginatedResult<AdminProviderSummaryResponseDto>> {
    const page = await this.listProviders.execute({ status: query.status, search: query.q }, query);
    return page.map(toAdminSummaryResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Provider detail with contact, documents and offerings' })
  @ApiEnvelopeResponse(AdminProviderDetailResponseDto, { description: 'Provider' })
  @ApiErrors(400, 404)
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminProviderDetailResponseDto> {
    return toAdminDetailResponse(await this.getProvider.execute(id));
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Provider documents with fresh signed links' })
  @ApiEnvelopeResponse(DocumentResponseDto, { description: 'Documents', isArray: true })
  @ApiErrors(400, 404)
  async documents(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentResponseDto[]> {
    return (await this.listDocuments.execute(id)).map(toDocumentResponse);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a pending provider, or reinstate a suspended one' })
  @ApiEnvelopeResponse(ProviderProfileResponseDto, { description: 'Verified' })
  @ApiErrors(400, 404, 409, 422)
  async verify(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProviderProfileResponseDto> {
    return toProviderProfileResponse(await this.verifyProvider.execute(actor, id));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending provider (reason required)' })
  @ApiEnvelopeResponse(ProviderProfileResponseDto, { description: 'Rejected' })
  @ApiErrors(400, 404, 409)
  async reject(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonRequestDto,
  ): Promise<ProviderProfileResponseDto> {
    return toProviderProfileResponse(await this.rejectProvider.execute(actor, id, body.reason));
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a verified provider (reason required)' })
  @ApiEnvelopeResponse(ProviderProfileResponseDto, { description: 'Suspended' })
  @ApiErrors(400, 404, 409)
  async suspend(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonRequestDto,
  ): Promise<ProviderProfileResponseDto> {
    return toProviderProfileResponse(await this.suspendProvider.execute(actor, id, body.reason));
  }
}
