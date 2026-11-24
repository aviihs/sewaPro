import { ApiProperty } from '@nestjs/swagger';
import { ActorRole } from '../../../../common/auth/role.js';
import { BookingStatus } from '../../domain/booking-state-machine.js';
import { type BookingDetail, type BookingSummary } from '../../domain/booking.repository.js';

const UUID = '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f';
const PRICING = ['FIXED', 'HOURLY', 'STARTING_FROM', 'QUOTATION'];

export class BookingPartyDto {
  @ApiProperty({ description: 'Display name', example: 'Thapa Electricals' })
  readonly name: string;

  @ApiProperty({
    description: 'Phone; null until the booking is accepted',
    example: '+9779841234567',
    nullable: true,
    type: String,
  })
  readonly phone: string | null;
}

export class BookingAddressDto {
  @ApiProperty({
    description: 'Street / house; null for the provider until accepted',
    example: 'House 12, Ward 4',
    nullable: true,
    type: String,
  })
  readonly line1: string | null;

  @ApiProperty({ description: 'Area', example: 'Baluwatar', nullable: true, type: String })
  readonly area: string | null;

  @ApiProperty({ description: 'City', example: 'Kathmandu' })
  readonly city: string;

  @ApiProperty({
    description: 'Landmark; null for the provider until accepted',
    example: null,
    nullable: true,
    type: String,
  })
  readonly landmark: string | null;

  @ApiProperty({
    description: 'Exact latitude; null for the provider until accepted',
    example: 27.72,
    nullable: true,
    type: Number,
  })
  readonly latitude: number | null;

  @ApiProperty({
    description: 'Exact longitude; null for the provider until accepted',
    example: 85.33,
    nullable: true,
    type: Number,
  })
  readonly longitude: number | null;
}

export class StatusHistoryDto {
  @ApiProperty({ enum: BookingStatus, nullable: true, example: BookingStatus.PENDING })
  readonly from: BookingStatus | null;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.ACCEPTED })
  readonly to: BookingStatus;

  @ApiProperty({ enum: ActorRole, example: ActorRole.PROVIDER })
  readonly actorRole: ActorRole;

  @ApiProperty({ description: 'Reason or note', example: null, nullable: true, type: String })
  readonly note: string | null;

  @ApiProperty({ example: '2030-01-07T04:20:00.000Z' })
  readonly at: Date;
}

export class BookingResponseDto {
  @ApiProperty({ format: 'uuid', example: UUID }) readonly id: string;
  @ApiProperty({ enum: BookingStatus, example: BookingStatus.PENDING })
  readonly status: BookingStatus;
  @ApiProperty({ example: '2030-01-07T04:15:00.000Z' }) readonly scheduledAt: Date;
  @ApiProperty({ example: '2030-01-07T05:15:00.000Z' }) readonly scheduledEndAt: Date;
  @ApiProperty({ format: 'uuid', example: UUID }) readonly serviceId: string;
  @ApiProperty({ example: 'Fan Installation' }) readonly serviceName: string;
  @ApiProperty({ format: 'uuid', example: UUID }) readonly providerId: string;
  @ApiProperty({ type: BookingPartyDto }) readonly provider: BookingPartyDto;
  @ApiProperty({ type: BookingPartyDto }) readonly customer: BookingPartyDto;
  @ApiProperty({ type: BookingAddressDto }) readonly address: BookingAddressDto;
  @ApiProperty({ nullable: true, type: String, example: 'Fan wobbles' })
  readonly problemDescription: string | null;
  @ApiProperty({ enum: PRICING, example: 'FIXED' }) readonly pricingType: string;
  @ApiProperty({
    description: 'Listed price at booking time (NPR)',
    nullable: true,
    type: Number,
    example: 1500,
  })
  readonly quotedPrice: number | null;
  @ApiProperty({
    description: 'Agreed estimate from an accepted quotation (NPR)',
    nullable: true,
    type: Number,
    example: null,
  })
  readonly estimatedAmount: number | null;
  @ApiProperty({
    description: 'Charged on completion (NPR)',
    nullable: true,
    type: Number,
    example: null,
  })
  readonly finalAmount: number | null;
  @ApiProperty({ nullable: true, type: String, example: null }) readonly cancelReason:
    string | null;
  @ApiProperty({ nullable: true, type: String, example: null }) readonly rejectionReason:
    string | null;
  @ApiProperty({ nullable: true, type: Date, example: null }) readonly acceptedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date, example: null }) readonly startedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date, example: null }) readonly completedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date, example: null }) readonly cancelledAt: Date | null;
  @ApiProperty({ example: '2030-01-06T10:00:00.000Z' }) readonly createdAt: Date;
  @ApiProperty({ type: [StatusHistoryDto] }) readonly history: StatusHistoryDto[];
}

export class BookingSummaryResponseDto {
  @ApiProperty({ format: 'uuid', example: UUID }) readonly id: string;
  @ApiProperty({ enum: BookingStatus, example: BookingStatus.ACCEPTED })
  readonly status: BookingStatus;
  @ApiProperty({ example: '2030-01-07T04:15:00.000Z' }) readonly scheduledAt: Date;
  @ApiProperty({ example: 'Fan Installation' }) readonly serviceName: string;
  @ApiProperty({
    description: 'Provider name (for customers) or customer name (for providers)',
    example: 'Thapa Electricals',
  })
  readonly counterpartName: string;
  @ApiProperty({ example: 'Baluwatar', nullable: true, type: String }) readonly area: string | null;
  @ApiProperty({ example: 'Kathmandu' }) readonly city: string;
  @ApiProperty({ nullable: true, type: Number, example: 1800 }) readonly finalAmount: number | null;
}

export type BookingViewer = 'customer' | 'provider' | 'admin';

/** Applies the privacy rules: the provider sees exact address and phones only once accepted. */
export function toBookingResponse(
  detail: BookingDetail,
  viewer: BookingViewer,
): BookingResponseDto {
  const { booking: b } = detail;
  const reveal = viewer === 'admin' || b.contactVisible;
  const exact = viewer !== 'provider' || reveal;
  return {
    id: b.id,
    status: b.status,
    scheduledAt: b.scheduledAt,
    scheduledEndAt: b.scheduledEndAt,
    serviceId: b.serviceId,
    serviceName: detail.serviceName,
    providerId: b.providerId,
    provider: {
      name: detail.provider.businessName ?? detail.provider.fullName,
      phone: viewer === 'provider' || reveal ? detail.provider.phone : null,
    },
    customer: {
      name: detail.customer.fullName,
      phone: viewer === 'customer' || reveal ? detail.customer.phone : null,
    },
    address: {
      line1: exact ? b.address.line1 : null,
      area: b.address.area,
      city: b.address.city,
      landmark: exact ? b.address.landmark : null,
      latitude: exact ? b.address.latitude : null,
      longitude: exact ? b.address.longitude : null,
    },
    problemDescription: b.problemDescription,
    pricingType: b.pricingType,
    quotedPrice: b.quotedPrice,
    estimatedAmount: b.estimatedAmount,
    finalAmount: b.finalAmount,
    cancelReason: b.cancelReason,
    rejectionReason: b.rejectionReason,
    acceptedAt: b.acceptedAt,
    startedAt: b.startedAt,
    completedAt: b.completedAt,
    cancelledAt: b.cancelledAt,
    createdAt: b.createdAt,
    history: detail.history.map((h) => ({
      from: h.from,
      to: h.to,
      actorRole: h.actorRole,
      note: h.note,
      at: h.at,
    })),
  };
}

export const toBookingSummaryResponse = ({
  booking: b,
  serviceName,
  counterpartName,
}: BookingSummary): BookingSummaryResponseDto => ({
  id: b.id,
  status: b.status,
  scheduledAt: b.scheduledAt,
  serviceName,
  counterpartName,
  area: b.address.area,
  city: b.address.city,
  finalAmount: b.finalAmount,
});
