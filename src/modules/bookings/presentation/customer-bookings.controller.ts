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
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { CurrentUser, Roles } from '../../../common/auth/auth.decorators.js';
import { type AuthenticatedUser, Role } from '../../../common/auth/role.js';
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { IdempotencyKey } from '../../../common/http/idempotency-key.decorator.js';
import { type PaginatedResult } from '../../../common/utils/pagination.js';
import { CancelBookingUseCase } from '../application/booking-actions.use-cases.js';
import {
  GetBookingDetailUseCase,
  ListMyBookingsUseCase,
} from '../application/booking-queries.use-cases.js';
import { CreateBookingUseCase } from '../application/create-booking.use-case.js';
import {
  BookingListQueryDto,
  CancelBookingRequestDto,
  CreateBookingRequestDto,
} from './dto/booking.request.dto.js';
import {
  BookingResponseDto,
  BookingSummaryResponseDto,
  toBookingResponse,
  toBookingSummaryResponse,
} from './dto/booking.response.dto.js';

@ApiTags('Bookings')
@ApiAuth()
@Roles(Role.CUSTOMER)
@Controller('bookings')
export class CustomerBookingsController {
  constructor(
    private readonly createBooking: CreateBookingUseCase,
    private readonly listBookings: ListMyBookingsUseCase,
    private readonly getBooking: GetBookingDetailUseCase,
    private readonly cancelBooking: CancelBookingUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Book a verified provider. Send an Idempotency-Key to make retries safe.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      '8-64 chars [A-Za-z0-9_-]; replaying returns the original booking with `Idempotent-Replayed: true`',
  })
  @ApiEnvelopeResponse(BookingResponseDto, {
    description: 'Booking created (or replayed)',
    status: HttpStatus.CREATED,
  })
  @ApiErrors(400, 404, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateBookingRequestDto,
    @IdempotencyKey() idempotencyKey: string | null,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookingResponseDto> {
    const { detail, replayed } = await this.createBooking.execute(user.id, {
      providerId: body.providerId,
      serviceId: body.serviceId,
      addressId: body.addressId,
      scheduledAt: body.scheduledAt,
      problemDescription: body.problemDescription ?? null,
      idempotencyKey,
    });
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return toBookingResponse(detail, 'customer');
  }

  @Get()
  @ApiOperation({ summary: 'My bookings, newest scheduled first' })
  @ApiPaginatedResponse(BookingSummaryResponseDto, 'Bookings')
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BookingListQueryDto,
  ): Promise<PaginatedResult<BookingSummaryResponseDto>> {
    const filter = { status: query.status, from: query.from, to: query.to };
    return (await this.listBookings.execute(user, filter, query)).map(toBookingSummaryResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my bookings, with status history' })
  @ApiEnvelopeResponse(BookingResponseDto, { description: 'Booking' })
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(await this.getBooking.execute(user, id, 'customer'), 'customer');
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a PENDING or ACCEPTED booking' })
  @ApiEnvelopeResponse(BookingResponseDto, { description: 'Cancelled' })
  @ApiErrors(400, 404, 409)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelBookingRequestDto,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(
      await this.cancelBooking.execute(user, id, body.reason ?? null),
      'customer',
    );
  }
}
