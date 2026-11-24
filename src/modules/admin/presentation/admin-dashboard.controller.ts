import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/auth/auth.decorators.js';
import { Role } from '../../../common/auth/role.js';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import {
  GetAdminDashboardUseCase,
  GetBookingReportUseCase,
  GetGrowthReportUseCase,
} from '../application/admin-reports.use-cases.js';
import {
  AdminDashboardResponseDto,
  BookingReportRowDto,
  GrowthRowDto,
  ReportQueryDto,
  toDashboardResponse,
} from './dto/admin.dto.js';

@ApiTags('Admin: Dashboard & Reports')
@ApiAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminDashboardController {
  constructor(
    private readonly dashboard: GetAdminDashboardUseCase,
    private readonly bookingReport: GetBookingReportUseCase,
    private readonly growthReport: GetGrowthReportUseCase,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Totals, bookings by status, 6-month growth, recent activity' })
  @ApiEnvelopeResponse(AdminDashboardResponseDto, { description: 'Dashboard' })
  async getDashboard(): Promise<AdminDashboardResponseDto> {
    return toDashboardResponse(await this.dashboard.execute());
  }

  @Get('reports/bookings')
  @ApiOperation({
    summary: 'Bookings created per day or month (Nepal time) with outcomes and completed totals',
  })
  @ApiEnvelopeResponse(BookingReportRowDto, { description: 'One row per period', isArray: true })
  @ApiErrors(400)
  async bookings(@Query() query: ReportQueryDto): Promise<BookingReportRowDto[]> {
    return this.bookingReport.execute({
      from: query.from,
      to: query.to,
      unit: query.groupBy ?? 'day',
    });
  }

  @Get('reports/growth')
  @ApiOperation({ summary: 'New customers, providers and bookings per day or month (Nepal time)' })
  @ApiEnvelopeResponse(GrowthRowDto, { description: 'One row per period', isArray: true })
  @ApiErrors(400)
  async growth(@Query() query: ReportQueryDto): Promise<GrowthRowDto[]> {
    return this.growthReport.execute({
      from: query.from,
      to: query.to,
      unit: query.groupBy ?? 'day',
    });
  }
}
