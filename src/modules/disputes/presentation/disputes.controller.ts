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
import { CurrentActor, CurrentUser, Roles } from '../../../common/auth/auth.decorators.js';
import { type Actor, type AuthenticatedUser, Role } from '../../../common/auth/role.js';
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { type PaginatedResult } from '../../../common/utils/pagination.js';
import {
  ResolveDisputeUseCase,
  StartDisputeReviewUseCase,
} from '../application/dispute-admin.use-cases.js';
import {
  GetDisputeUseCase,
  ListDisputesUseCase,
} from '../application/dispute-queries.use-cases.js';
import { RaiseDisputeUseCase } from '../application/raise-dispute.use-case.js';
import {
  DisputeListQueryDto,
  DisputeResponseDto,
  RaiseDisputeRequestDto,
  ResolveDisputeRequestDto,
  toDisputeResponse,
} from './dto/dispute.dto.js';

@ApiTags('Disputes')
@ApiAuth()
@Controller()
export class DisputesController {
  constructor(
    private readonly raiseDispute: RaiseDisputeUseCase,
    private readonly listDisputes: ListDisputesUseCase,
    private readonly getDispute: GetDisputeUseCase,
    private readonly startReview: StartDisputeReviewUseCase,
    private readonly resolveDispute: ResolveDisputeUseCase,
  ) {}

  @Post('disputes')
  @Roles(Role.CUSTOMER, Role.PROVIDER)
  @ApiOperation({ summary: 'Raise a dispute on your booking (moves it to DISPUTED)' })
  @ApiEnvelopeResponse(DisputeResponseDto, {
    description: 'Dispute opened',
    status: HttpStatus.CREATED,
  })
  @ApiErrors(400, 404, 409, 422)
  async raise(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RaiseDisputeRequestDto,
  ): Promise<DisputeResponseDto> {
    return toDisputeResponse(await this.raiseDispute.execute(user, body));
  }

  @Get('disputes')
  @Roles(Role.CUSTOMER, Role.PROVIDER)
  @ApiOperation({ summary: 'Disputes on my bookings' })
  @ApiPaginatedResponse(DisputeResponseDto, 'Disputes')
  @ApiErrors(400)
  async mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DisputeListQueryDto,
  ): Promise<PaginatedResult<DisputeResponseDto>> {
    return (await this.listDisputes.execute(user, query.status, query)).map(toDisputeResponse);
  }

  @Get('disputes/:id')
  @ApiOperation({ summary: 'A dispute (parties of the booking and admins)' })
  @ApiEnvelopeResponse(DisputeResponseDto, { description: 'Dispute' })
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DisputeResponseDto> {
    return toDisputeResponse(await this.getDispute.execute(user, id));
  }

  @Get('admin/disputes')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'All disputes, newest first' })
  @ApiPaginatedResponse(DisputeResponseDto, 'Disputes')
  @ApiErrors(400)
  async all(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DisputeListQueryDto,
  ): Promise<PaginatedResult<DisputeResponseDto>> {
    return (await this.listDisputes.execute(user, query.status, query)).map(toDisputeResponse);
  }

  @Post('admin/disputes/:id/review')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take an open dispute into review' })
  @ApiEnvelopeResponse(DisputeResponseDto, { description: 'Under review' })
  @ApiErrors(400, 404, 409)
  async review(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DisputeResponseDto> {
    return toDisputeResponse(await this.startReview.execute(actor, id));
  }

  @Post('admin/disputes/:id/resolve')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve: the booking becomes COMPLETED or CANCELLED' })
  @ApiEnvelopeResponse(DisputeResponseDto, { description: 'Resolved' })
  @ApiErrors(400, 404, 409, 422)
  async resolve(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveDisputeRequestDto,
  ): Promise<DisputeResponseDto> {
    return toDisputeResponse(await this.resolveDispute.execute(actor, id, body));
  }
}
