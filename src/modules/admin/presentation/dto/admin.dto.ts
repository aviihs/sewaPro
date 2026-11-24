import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ActorRole, Role } from '../../../../common/auth/role.js';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto.js';
import { Trim } from '../../../../common/validation/validators.js';
import { UserStatus } from '../../../users/domain/user.js';
import { type AdminDashboard } from '../../application/admin-reports.use-cases.js';
import { type PeriodUnit } from '../../domain/admin-stats.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  @ApiProperty({ description: 'First Nepal date (inclusive)', example: '2030-01-01' })
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  readonly from: string;

  @ApiProperty({ description: 'Last Nepal date (inclusive)', example: '2030-01-31' })
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  readonly to: string;

  @ApiPropertyOptional({
    description: 'Bucket size (max 366 days or 60 months)',
    enum: ['day', 'month'],
    default: 'day',
  })
  @IsOptional()
  @IsIn(['day', 'month'])
  readonly groupBy?: PeriodUnit;
}

export class AdminUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) readonly role?: Role;
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  readonly status?: UserStatus;
  @ApiPropertyOptional({
    description: 'Name, email or phone contains',
    example: 'sharma',
    maxLength: 80,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 80)
  readonly q?: string;
}

export class StatusReasonRequestDto {
  @ApiProperty({
    description: 'Kept in the audit log',
    example: 'Repeated fake bookings reported',
    minLength: 5,
    maxLength: 500,
  })
  @Trim()
  @IsString()
  @Length(5, 500)
  readonly reason: string;
}

export class DashboardTotalsDto {
  @ApiProperty({ example: 1200 }) readonly customers: number;
  @ApiProperty({ example: 140 }) readonly providers: number;
  @ApiProperty({ example: 110 }) readonly verifiedProviders: number;
  @ApiProperty({ example: 12 }) readonly pendingVerification: number;
  @ApiProperty({ example: 3 }) readonly suspendedUsers: number;
  @ApiProperty({
    example: { PENDING: 8, COMPLETED: 530 },
    type: 'object',
    additionalProperties: { type: 'integer' },
  })
  readonly bookingsByStatus: Record<string, number>;
  @ApiProperty({ example: 2 }) readonly openDisputes: number;
}

export class GrowthRowDto {
  @ApiProperty({ description: 'YYYY-MM-DD or YYYY-MM (Nepal time)', example: '2030-01' })
  readonly period: string;
  @ApiProperty({ example: 40 }) readonly newCustomers: number;
  @ApiProperty({ example: 5 }) readonly newProviders: number;
  @ApiProperty({ example: 120 }) readonly newBookings: number;
}

export class BookingReportRowDto {
  @ApiProperty({ example: '2030-01-07' }) readonly period: string;
  @ApiProperty({ description: 'Bookings created', example: 14 }) readonly created: number;
  @ApiProperty({ description: 'Of those, now completed', example: 9 }) readonly completed: number;
  @ApiProperty({ description: 'Of those, cancelled or rejected', example: 2 })
  readonly cancelled: number;
  @ApiProperty({ description: 'Sum of final amounts of the completed ones, NPR', example: 15400 })
  readonly completedAmount: number;
}

export class ActivityItemDto {
  @ApiProperty({ example: 'provider.verified' }) readonly action: string;
  @ApiProperty({ example: 'Provider' }) readonly entityType: string;
  @ApiProperty({ nullable: true, type: String, example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' })
  readonly entityId: string | null;
  @ApiProperty({ enum: ActorRole, nullable: true, example: ActorRole.ADMIN })
  readonly actorRole: ActorRole | null;
  @ApiProperty({ example: '2030-01-07T04:20:00.000Z' }) readonly createdAt: Date;
}

export class AdminDashboardResponseDto {
  @ApiProperty({ type: DashboardTotalsDto }) readonly totals: DashboardTotalsDto;
  @ApiProperty({ type: [GrowthRowDto], description: 'Current and previous 5 months' })
  readonly monthlyGrowth: GrowthRowDto[];
  @ApiProperty({ type: [ActivityItemDto], description: 'Latest audit entries' })
  readonly recentActivity: ActivityItemDto[];
}

export const toDashboardResponse = (d: AdminDashboard): AdminDashboardResponseDto => ({
  totals: { ...d.totals, bookingsByStatus: { ...d.totals.bookingsByStatus } },
  monthlyGrowth: d.monthlyGrowth,
  recentActivity: d.recentActivity,
});
