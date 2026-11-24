import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser } from '../../../common/auth/role.js';
import { type Booking } from '../../bookings/domain/booking.js';
import { BookingRepository } from '../../bookings/domain/booking.repository.js';
import { BookingNotFoundError } from '../../bookings/domain/bookings.errors.js';
import { type Quotation } from '../domain/quotation.js';
import { QuotationRepository } from '../domain/quotation.repository.js';
import { QuotationNotFoundError } from '../domain/quotations.errors.js';

/** Resolves bookings and quotations the caller is a party to; 404 for anything else. */
@Injectable()
export class QuotationAccess {
  constructor(
    readonly bookings: BookingRepository,
    readonly quotations: QuotationRepository,
  ) {}

  async booking(
    user: AuthenticatedUser,
    bookingId: string,
    side: 'customer' | 'provider',
  ): Promise<Booking> {
    const booking = await this.bookings.findById(bookingId);
    const owns = side === 'customer' ? booking?.isCustomer(user.id) : booking?.isProvider(user.id);
    if (!booking || owns !== true) throw new BookingNotFoundError();
    return booking;
  }

  async quotation(booking: Booking, quotationId: string): Promise<Quotation> {
    const quotation = await this.quotations.findById(quotationId);
    if (quotation?.bookingId !== booking.id) throw new QuotationNotFoundError();
    return quotation;
  }

  /** A quotation owned (through its booking) by the signed-in provider. */
  async providerQuotation(
    user: AuthenticatedUser,
    quotationId: string,
  ): Promise<{ booking: Booking; quotation: Quotation }> {
    const quotation = await this.quotations.findById(quotationId);
    const booking = quotation ? await this.bookings.findById(quotation.bookingId) : null;
    if (!quotation || !booking?.isProvider(user.id)) throw new QuotationNotFoundError();
    return { booking, quotation };
  }
}
