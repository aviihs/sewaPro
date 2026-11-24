import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, CurrentUser, Roles } from '../../../common/auth/auth.decorators.js';
import { type Actor, type AuthenticatedUser, Role } from '../../../common/auth/role.js';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import {
  CreateQuotationUseCase,
  ListQuotationsUseCase,
  SendQuotationUseCase,
} from '../application/provider-quotations.use-cases.js';
import {
  AcceptQuotationUseCase,
  DeclineQuotationUseCase,
} from '../application/respond-quotation.use-cases.js';
import { QUOTATION_VALIDITY } from '../domain/quotation.js';
import {
  CreateQuotationRequestDto,
  QuotationResponseDto,
  toQuotationResponse,
} from './dto/quotation.dto.js';

@ApiTags('Quotations')
@ApiAuth()
@Controller()
export class QuotationsController {
  constructor(
    private readonly createQuotation: CreateQuotationUseCase,
    private readonly sendQuotation: SendQuotationUseCase,
    private readonly listQuotations: ListQuotationsUseCase,
    private readonly acceptQuotation: AcceptQuotationUseCase,
    private readonly declineQuotation: DeclineQuotationUseCase,
  ) {}

  @Post('providers/me/bookings/:bookingId/quotations')
  @Roles(Role.PROVIDER)
  @ApiOperation({
    summary:
      'Draft a quotation for one of my PENDING/ACCEPTED bookings (total computed server-side)',
  })
  @ApiEnvelopeResponse(QuotationResponseDto, {
    description: 'Draft created',
    status: HttpStatus.CREATED,
  })
  @ApiErrors(400, 404, 409)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() body: CreateQuotationRequestDto,
  ): Promise<QuotationResponseDto> {
    const quotation = await this.createQuotation.execute(user, bookingId, {
      labourCost: body.labourCost,
      materialCost: body.materialCost,
      note: body.note ?? null,
      validForHours: body.validForHours ?? QUOTATION_VALIDITY.defaultHours,
    });
    return toQuotationResponse(quotation);
  }

  @Post('providers/me/quotations/:quotationId/send')
  @Roles(Role.PROVIDER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a draft quotation to the customer' })
  @ApiEnvelopeResponse(QuotationResponseDto, { description: 'Sent' })
  @ApiErrors(400, 404, 409, 422)
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quotationId', ParseUUIDPipe) id: string,
  ): Promise<QuotationResponseDto> {
    return toQuotationResponse(await this.sendQuotation.execute(user, id));
  }

  @Get('providers/me/bookings/:bookingId/quotations')
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: 'Quotations of one of my bookings, including drafts' })
  @ApiEnvelopeResponse(QuotationResponseDto, { description: 'Quotations', isArray: true })
  @ApiErrors(400, 404)
  async providerList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<QuotationResponseDto[]> {
    return (await this.listQuotations.execute(user, bookingId, 'provider')).map(
      toQuotationResponse,
    );
  }

  @Get('bookings/:bookingId/quotations')
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'Quotations sent for my booking' })
  @ApiEnvelopeResponse(QuotationResponseDto, { description: 'Quotations', isArray: true })
  @ApiErrors(400, 404)
  async customerList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<QuotationResponseDto[]> {
    return (await this.listQuotations.execute(user, bookingId, 'customer')).map(
      toQuotationResponse,
    );
  }

  @Post('bookings/:bookingId/quotations/:quotationId/accept')
  @Roles(Role.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a quotation: sets the estimate and confirms a pending booking' })
  @ApiEnvelopeResponse(QuotationResponseDto, { description: 'Accepted' })
  @ApiErrors(400, 404, 409, 422)
  async accept(
    @CurrentActor() actor: Actor,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
  ): Promise<QuotationResponseDto> {
    return toQuotationResponse(await this.acceptQuotation.execute(actor, bookingId, quotationId));
  }

  @Post('bookings/:bookingId/quotations/:quotationId/decline')
  @Roles(Role.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a quotation' })
  @ApiEnvelopeResponse(QuotationResponseDto, { description: 'Declined' })
  @ApiErrors(400, 404, 409)
  async decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
  ): Promise<QuotationResponseDto> {
    return toQuotationResponse(await this.declineQuotation.execute(user, bookingId, quotationId));
  }
}
