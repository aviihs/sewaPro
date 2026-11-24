import { Injectable } from '@nestjs/common';
import { PaginatedResult, type PageRequest, toOffset } from '../../../common/utils/pagination.js';
import { type Prisma } from '../../../infrastructure/prisma/generated/client.js';
import {
  isExclusionViolation,
  isUniqueViolation,
} from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import { type Booking, type StatusChange } from '../domain/booking.js';
import {
  type BookingDetail,
  type BookingListFilter,
  BookingRepository,
  type BookingSummary,
  type NewBooking,
} from '../domain/booking.repository.js';
import {
  ConcurrentBookingUpdateError,
  IdempotencyKeyReusedError,
  SlotUnavailableError,
} from '../domain/bookings.errors.js';
import {
  bookingInclude,
  detailInclude,
  summaryInclude,
  toBooking,
  toDetail,
  toSummary,
} from './booking.mapper.js';

const LIVE = { notIn: ['CANCELLED', 'REJECTED'] } satisfies Prisma.EnumBookingStatusFilter;

@Injectable()
export class PrismaBookingRepository extends BookingRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client;
  }

  async lockProviderSchedule(providerId: string): Promise<void> {
    await this.db.$queryRaw`SELECT 1 FROM providers WHERE id = ${providerId}::uuid FOR UPDATE`;
  }

  async create(input: NewBooking): Promise<Booking> {
    const { address, ...rest } = input;
    try {
      const row = await this.db.booking.create({
        data: {
          ...rest,
          addressLine1: address.line1,
          addressArea: address.area,
          addressCity: address.city,
          addressLandmark: address.landmark,
          addressLatitude: address.latitude,
          addressLongitude: address.longitude,
        },
        include: bookingInclude,
      });
      return toBooking(row);
    } catch (error) {
      if (isExclusionViolation(error, 'bookings_no_provider_overlap'))
        throw new SlotUnavailableError();
      if (isUniqueViolation(error, 'idempotency_key')) throw new IdempotencyKeyReusedError();
      throw error;
    }
  }

  async findById(id: string): Promise<Booking | null> {
    const row = await this.db.booking.findUnique({ where: { id }, include: bookingInclude });
    return row ? toBooking(row) : null;
  }

  async findDetail(id: string): Promise<BookingDetail | null> {
    const row = await this.db.booking.findUnique({ where: { id }, include: detailInclude });
    return row ? toDetail(row) : null;
  }

  async findByIdempotencyKey(customerId: string, key: string): Promise<Booking | null> {
    const row = await this.db.booking.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey: key } },
      include: bookingInclude,
    });
    return row ? toBooking(row) : null;
  }

  async hasOverlap(providerId: string, start: Date, end: Date): Promise<boolean> {
    const count = await this.db.booking.count({
      where: { providerId, status: LIVE, scheduledAt: { lt: end }, scheduledEndAt: { gt: start } },
    });
    return count > 0;
  }

  countLiveBetween(providerId: string, start: Date, end: Date): Promise<number> {
    return this.db.booking.count({
      where: { providerId, status: LIVE, scheduledAt: { gte: start, lt: end } },
    });
  }

  async saveTransition(booking: Booking, change: StatusChange): Promise<Booking> {
    const { count } = await this.db.booking.updateMany({
      where: { id: booking.id, status: change.from ?? booking.status },
      data: {
        status: booking.status,
        acceptedAt: booking.acceptedAt,
        startedAt: booking.startedAt,
        completedAt: booking.completedAt,
        cancelledAt: booking.cancelledAt,
        cancelReason: booking.cancelReason,
        rejectionReason: booking.rejectionReason,
        finalAmount: booking.finalAmount,
      },
    });
    if (count === 0) throw new ConcurrentBookingUpdateError();
    await this.appendHistory(change);
    return toBooking(
      await this.db.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: bookingInclude,
      }),
    );
  }

  async appendHistory(change: StatusChange): Promise<void> {
    await this.db.bookingStatusHistory.create({
      data: {
        bookingId: change.bookingId,
        fromStatus: change.from,
        toStatus: change.to,
        actorId: change.actorId,
        actorRole: change.actorRole,
        note: change.note,
        createdAt: change.at,
      },
    });
  }

  async setEstimatedAmount(id: string, amount: number): Promise<void> {
    await this.db.booking.update({ where: { id }, data: { estimatedAmount: amount } });
  }

  listForCustomer(
    customerId: string,
    filter: BookingListFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<BookingSummary>> {
    return this.list({ customerId }, filter, page, 'customer');
  }

  listForProvider(
    providerId: string,
    filter: BookingListFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<BookingSummary>> {
    return this.list({ providerId }, filter, page, 'provider');
  }

  listAll(filter: BookingListFilter, page: PageRequest): Promise<PaginatedResult<BookingSummary>> {
    return this.list({}, filter, page, 'admin');
  }

  private async list(
    scope: Prisma.BookingWhereInput,
    filter: BookingListFilter,
    page: PageRequest,
    side: 'customer' | 'provider' | 'admin',
  ): Promise<PaginatedResult<BookingSummary>> {
    const where: Prisma.BookingWhereInput = {
      ...scope,
      status: filter.status,
      ...(filter.from || filter.to ? { scheduledAt: { gte: filter.from, lt: filter.to } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.booking.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
        ...toOffset(page),
      }),
      this.db.booking.count({ where }),
    ]);
    return PaginatedResult.of(rows.map(toSummary(side)), total, page);
  }
}
