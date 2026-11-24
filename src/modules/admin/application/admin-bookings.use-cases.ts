import { Injectable } from '@nestjs/common';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import {
  type BookingDetail,
  type BookingListFilter,
  BookingRepository,
  type BookingSummary,
} from '../../bookings/domain/booking.repository.js';
import { BookingNotFoundError } from '../../bookings/domain/bookings.errors.js';

/** Admin monitoring: every booking, filterable by status and schedule window. */
@Injectable()
export class ListAllBookingsUseCase {
  constructor(private readonly bookings: BookingRepository) {}

  execute(filter: BookingListFilter, page: PageRequest): Promise<PaginatedResult<BookingSummary>> {
    return this.bookings.listAll(filter, page);
  }
}

@Injectable()
export class GetBookingForAdminUseCase {
  constructor(private readonly bookings: BookingRepository) {}

  async execute(bookingId: string): Promise<BookingDetail> {
    const detail = await this.bookings.findDetail(bookingId);
    if (!detail) throw new BookingNotFoundError();
    return detail;
  }
}
