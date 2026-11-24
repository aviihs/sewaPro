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
import { CurrentUser, Roles } from '../../../common/auth/auth.decorators.js';
import { type AuthenticatedUser, Role } from '../../../common/auth/role.js';
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { type PaginatedResult } from '../../../common/utils/pagination.js';
import {
  AcceptBookingUseCase,
  CompleteJobUseCase,
  MarkOnTheWayUseCase,
  RejectBookingUseCase,
  StartJobUseCase,
} from '../application/booking-actions.use-cases.js';
import {
  GetBookingDetailUseCase,
  ListProviderBookingsUseCase,
} from '../application/booking-queries.use-cases.js';
import {
  BookingListQueryDto,
  CompleteBookingRequestDto,
  RejectBookingRequestDto,
} from './dto/booking.request.dto.js';
import {
  BookingResponseDto,
  BookingSummaryResponseDto,
  toBookingResponse,
  toBookingSummaryResponse,
} from './dto/booking.response.dto.js';

/** Jobs assigned to the signed-in provider. Customer contact is hidden until accepted. */
@ApiTags('Bookings: Provider')
@ApiAuth()
@Roles(Role.PROVIDER)
@Controller('providers/me/bookings')
export class ProviderBookingsController {
  constructor(
    private readonly listBookings: ListProviderBookingsUseCase,
    private readonly getBooking: GetBookingDetailUseCase,
    private readonly acceptBooking: AcceptBookingUseCase,
    private readonly rejectBooking: RejectBookingUseCase,
    private readonly markOnTheWay: MarkOnTheWayUseCase,
    private readonly startJob: StartJobUseCase,
    private readonly completeJob: CompleteJobUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Bookings assigned to me' })
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
  @ApiOperation({ summary: 'Booking detail (exact address and phone only after accepting)' })
  @ApiEnvelopeResponse(BookingResponseDto, { description: 'Booking' })
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(await this.getBooking.execute(user, id, 'provider'), 'provider');
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a pending booking' })
  @ApiEnvelopeResponse(BookingResponseDto, { description: 'Accepted' })
  @ApiErrors(400, 404, 409)
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(await this.acceptBooking.execute(user, id), 'provider');
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending booking (reason required)' })
  @ApiEnvelopeResponse(BookingResponseDto, { description: 'Rejected' })
  @ApiErrors(400, 404, 409)
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectBookingRequestDto,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(await this.rejectBooking.execute(user, id, body.reason), 'provider');
  }

  @Post(':id/on-the-way')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark that you are travelling to the customer' })
  @ApiEnvelopeResponse(BookingResponseDto, { description: 'On the way' })
  @ApiErrors(400, 404, 409)
  async onTheWay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(await this.markOnTheWay.execute(user, id), 'provider');
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the job on site' })
  @ApiEnvelopeResponse(BookingResponseDto, { description: 'In progress' })
  @ApiErrors(400, 404, 409)
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(await this.startJob.execute(user, id), 'provider');
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete the job with the final amount charged' })
  @ApiEnvelopeResponse(BookingResponseDto, { description: 'Completed' })
  @ApiErrors(400, 404, 409)
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteBookingRequestDto,
  ): Promise<BookingResponseDto> {
    return toBookingResponse(
      await this.completeJob.execute(user, id, body.finalAmount),
      'provider',
    );
  }
}
