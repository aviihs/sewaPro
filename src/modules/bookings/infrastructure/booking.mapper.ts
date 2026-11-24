import { type Prisma } from '../../../infrastructure/prisma/generated/client.js';
import { Booking, type StatusChange } from '../domain/booking.js';
import { type BookingDetail, type BookingSummary } from '../domain/booking.repository.js';

export const bookingInclude = {
  provider: { select: { userId: true } },
} satisfies Prisma.BookingInclude;

export const summaryInclude = {
  provider: { select: { userId: true, businessName: true, user: { select: { fullName: true } } } },
  customer: { select: { fullName: true } },
  service: { select: { name: true } },
} satisfies Prisma.BookingInclude;

export const detailInclude = {
  provider: {
    select: { userId: true, businessName: true, user: { select: { fullName: true, phone: true } } },
  },
  customer: { select: { fullName: true, phone: true } },
  service: { select: { name: true } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.BookingInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;
type SummaryRow = Prisma.BookingGetPayload<{ include: typeof summaryInclude }>;
type DetailRow = Prisma.BookingGetPayload<{ include: typeof detailInclude }>;
type HistoryRow = DetailRow['statusHistory'][number];

const money = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : value.toNumber();

export function toBooking(row: BookingRow): Booking {
  return Booking.restore({
    id: row.id,
    customerId: row.customerId,
    providerId: row.providerId,
    providerUserId: row.provider.userId,
    serviceId: row.serviceId,
    status: row.status,
    scheduledAt: row.scheduledAt,
    scheduledEndAt: row.scheduledEndAt,
    problemDescription: row.problemDescription,
    pricingType: row.pricingType,
    quotedPrice: money(row.quotedPrice),
    estimatedAmount: money(row.estimatedAmount),
    finalAmount: money(row.finalAmount),
    address: {
      line1: row.addressLine1,
      area: row.addressArea,
      city: row.addressCity,
      landmark: row.addressLandmark,
      latitude: row.addressLatitude,
      longitude: row.addressLongitude,
    },
    cancelReason: row.cancelReason,
    rejectionReason: row.rejectionReason,
    idempotencyKey: row.idempotencyKey,
    acceptedAt: row.acceptedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

const toChange = (row: HistoryRow): StatusChange => ({
  bookingId: row.bookingId,
  from: row.fromStatus,
  to: row.toStatus,
  actorId: row.actorId,
  actorRole: row.actorRole,
  note: row.note,
  at: row.createdAt,
});

export const toSummary =
  (side: 'customer' | 'provider' | 'admin') =>
  (row: SummaryRow): BookingSummary => ({
    booking: toBooking(row),
    serviceName: row.service.name,
    counterpartName:
      side === 'provider'
        ? row.customer.fullName
        : (row.provider.businessName ?? row.provider.user.fullName),
  });

export const toDetail = (row: DetailRow): BookingDetail => ({
  booking: toBooking(row),
  serviceName: row.service.name,
  customer: { fullName: row.customer.fullName, phone: row.customer.phone },
  provider: {
    businessName: row.provider.businessName,
    fullName: row.provider.user.fullName,
    phone: row.provider.user.phone,
  },
  history: row.statusHistory.map(toChange),
});
