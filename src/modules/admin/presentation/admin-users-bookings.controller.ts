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
import { BookingListQueryDto } from '../../bookings/presentation/dto/booking.request.dto.js';
import {
  BookingResponseDto,
  BookingSummaryResponseDto,
  toBookingResponse,
  toBookingSummaryResponse,
} from '../../bookings/presentation/dto/booking.response.dto.js';
import {
  UserProfileResponseDto,
  toUserProfileResponse,
} from '../../users/presentation/dto/user-profile.response.dto.js';
import {
  GetBookingForAdminUseCase,
  ListAllBookingsUseCase,
} from '../application/admin-bookings.use-cases.js';
import {
  ListUsersUseCase,
  ReactivateUserUseCase,
  SuspendUserUseCase,
} from '../application/admin-users.use-cases.js';
import { AdminUserQueryDto, StatusReasonRequestDto } from './dto/admin.dto.js';

@ApiTags('Admin: Users & Bookings')
@ApiAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminUsersBookingsController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly suspendUser: SuspendUserUseCase,
    private readonly reactivateUser: ReactivateUserUseCase,
    private readonly listBookings: ListAllBookingsUseCase,
    private readonly getBooking: GetBookingForAdminUseCase,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'Users by role/status, searchable, newest first' })
  @ApiPaginatedResponse(UserProfileResponseDto, 'Users')
  @ApiErrors(400)
  async users(@Query() query: AdminUserQueryDto): Promise<PaginatedResult<UserProfileResponseDto>> {
    const page = await this.listUsers.execute(
      { role: query.role, status: query.status, search: query.q },
      query,
    );
    return page.map(toUserProfileResponse);
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend an account: blocks login and ends all sessions' })
  @ApiEnvelopeResponse(UserProfileResponseDto, { description: 'Suspended' })
  @ApiErrors(400, 404, 409, 422)
  async suspend(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusReasonRequestDto,
  ): Promise<UserProfileResponseDto> {
    return toUserProfileResponse(await this.suspendUser.execute(actor, id, body.reason));
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lift a suspension (unverified providers return to PENDING)' })
  @ApiEnvelopeResponse(UserProfileResponseDto, { description: 'Reactivated' })
  @ApiErrors(400, 404, 409, 422)
  async reactivate(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusReasonRequestDto,
  ): Promise<UserProfileResponseDto> {
    return toUserProfileResponse(await this.reactivateUser.execute(actor, id, body.reason));
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Monitor all bookings' })
  @ApiPaginatedResponse(BookingSummaryResponseDto, 'Bookings')
  @ApiErrors(400)
  async bookings(
    @Query() query: BookingListQueryDto,
  ): Promise<PaginatedResult<BookingSummaryResponseDto>> {
    const filter = { status: query.status, from: query.from, to: query.to };
    return (await this.listBookings.execute(filter, query)).map(toBookingSummaryResponse);
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Full booking detail with history' })
  @ApiEnvelopeResponse(BookingResponseDto, { description: 'Booking' })
  @ApiErrors(400, 404)
  async booking(@Param('id', ParseUUIDPipe) id: string): Promise<BookingResponseDto> {
    return toBookingResponse(await this.getBooking.execute(id), 'admin');
  }
}
