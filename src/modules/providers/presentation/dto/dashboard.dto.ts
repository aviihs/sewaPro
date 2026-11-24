import { ApiProperty } from '@nestjs/swagger';
import { type EarningsTotals } from '../../domain/provider.repositories.js';
import {
  type EarningsSummary,
  type ProviderDashboard,
} from '../../application/dashboard.use-cases.js';
import { VerificationStatus } from '../../domain/provider.js';

export class BookingCountsDto {
  @ApiProperty({ description: 'Waiting for your answer', example: 2 })
  readonly pending: number;

  @ApiProperty({ description: 'Accepted, not started', example: 3 })
  readonly accepted: number;

  @ApiProperty({ description: 'On the way or in progress', example: 1 })
  readonly inProgress: number;

  @ApiProperty({ description: 'Completed', example: 40 })
  readonly completed: number;

  @ApiProperty({ description: 'Cancelled or rejected', example: 4 })
  readonly cancelled: number;

  @ApiProperty({ description: 'Disputed', example: 0 })
  readonly disputed: number;

  @ApiProperty({ description: 'Live bookings scheduled today (Nepal time)', example: 2 })
  readonly scheduledToday: number;
}

export class ProviderDashboardResponseDto {
  @ApiProperty({
    description: 'Verification status',
    enum: VerificationStatus,
    example: VerificationStatus.VERIFIED,
  })
  readonly verificationStatus: VerificationStatus;

  @ApiProperty({ description: 'Accepting new bookings', example: true })
  readonly isAvailable: boolean;

  @ApiProperty({ description: 'Average rating', example: 4.6 })
  readonly ratingAverage: number;

  @ApiProperty({ description: 'Number of reviews', example: 21 })
  readonly ratingCount: number;

  @ApiProperty({ type: BookingCountsDto })
  readonly bookings: BookingCountsDto;
}

export class EarningsTotalsDto {
  @ApiProperty({ description: 'Completed jobs', example: 12 })
  readonly completedJobs: number;

  @ApiProperty({
    description: 'Sum of final amounts of completed jobs, NPR (no commission applied)',
    example: 24500,
  })
  readonly totalAmount: number;
}

export class EarningsSummaryResponseDto {
  @ApiProperty({ type: EarningsTotalsDto })
  readonly allTime: EarningsTotalsDto;

  @ApiProperty({ type: EarningsTotalsDto, description: 'Current calendar month, Nepal time' })
  readonly thisMonth: EarningsTotalsDto;
}

export const toDashboardResponse = ({
  provider,
  bookings,
}: ProviderDashboard): ProviderDashboardResponseDto => ({
  verificationStatus: provider.verificationStatus,
  isAvailable: provider.isAvailable,
  ratingAverage: provider.ratingAverage,
  ratingCount: provider.ratingCount,
  bookings: { ...bookings },
});

const totals = (t: EarningsTotals): EarningsTotalsDto => ({
  completedJobs: t.completedJobs,
  totalAmount: t.totalAmount,
});

export const toEarningsResponse = (e: EarningsSummary): EarningsSummaryResponseDto => ({
  allTime: totals(e.allTime),
  thisMonth: totals(e.thisMonth),
});
