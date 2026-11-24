import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser } from '../../../common/auth/role.js';
import { type PageRequest, PaginatedResult } from '../../../common/utils/pagination.js';
import { ProviderRepository } from '../../providers/domain/provider.repositories.js';
import {
  type BookingDetail,
  type BookingListFilter,
  BookingRepository,
  type BookingSummary,
} from '../domain/booking.repository.js';
import { BookingNotFoundError } from '../domain/bookings.errors.js';

@Injectable()
export class ListMyBookingsUseCase {
  constructor(private readonly bookings: BookingRepository) {}

  execute(
    user: AuthenticatedUser,
    filter: BookingListFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<BookingSummary>> {
    return this.bookings.listForCustomer(user.id, filter, page);
  }
}

@Injectable()
export class ListProviderBookingsUseCase {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly providers: ProviderRepository,
  ) {}

  async execute(
    user: AuthenticatedUser,
    filter: BookingListFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<BookingSummary>> {
    const provider = await this.providers.findByUserId(user.id);
    if (!provider) return PaginatedResult.of([], 0, page);
    return this.bookings.listForProvider(provider.id, filter, page);
  }
}

/** Detail for either party; 404 for anyone else. Privacy is applied by the presenter per side. */
@Injectable()
export class GetBookingDetailUseCase {
  constructor(private readonly bookings: BookingRepository) {}

  async execute(
    user: AuthenticatedUser,
    bookingId: string,
    side: 'customer' | 'provider',
  ): Promise<BookingDetail> {
    const detail = await this.bookings.findDetail(bookingId);
    const booking = detail?.booking;
    const owns = side === 'customer' ? booking?.isCustomer(user.id) : booking?.isProvider(user.id);
    if (!detail || owns !== true) throw new BookingNotFoundError();
    return detail;
  }
}
