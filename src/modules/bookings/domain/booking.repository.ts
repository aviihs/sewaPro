import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import { type BookingStatus } from './booking-state-machine.js';
import {
  type AddressSnapshot,
  type Booking,
  type PricingType,
  type StatusChange,
} from './booking.js';

export interface NewBooking {
  readonly customerId: string;
  readonly providerId: string;
  readonly serviceId: string;
  readonly addressId: string;
  readonly scheduledAt: Date;
  readonly scheduledEndAt: Date;
  readonly problemDescription: string | null;
  readonly pricingType: PricingType;
  readonly quotedPrice: number | null;
  readonly address: AddressSnapshot;
  readonly idempotencyKey: string | null;
}

/** Booking plus the names/phones needed to display it; privacy is applied by the caller. */
export interface BookingDetail {
  readonly booking: Booking;
  readonly serviceName: string;
  readonly customer: { readonly fullName: string; readonly phone: string };
  readonly provider: {
    readonly businessName: string | null;
    readonly fullName: string;
    readonly phone: string;
  };
  readonly history: readonly StatusChange[];
}

export interface BookingSummary {
  readonly booking: Booking;
  readonly serviceName: string;
  readonly counterpartName: string;
}

export interface BookingListFilter {
  readonly status?: BookingStatus;
  readonly from?: Date;
  readonly to?: Date;
}

export abstract class BookingRepository {
  /**
   * Serializes booking creation per provider for the rest of the transaction
   * (row lock), so the daily-limit count cannot be raced.
   */
  abstract lockProviderSchedule(providerId: string): Promise<void>;
  /** @throws SlotUnavailableError when the DB exclusion constraint rejects an overlap. */
  abstract create(booking: NewBooking): Promise<Booking>;
  abstract findById(id: string): Promise<Booking | null>;
  abstract findDetail(id: string): Promise<BookingDetail | null>;
  abstract findByIdempotencyKey(customerId: string, key: string): Promise<Booking | null>;
  /** True if a live booking of the provider overlaps `[start, end)`. */
  abstract hasOverlap(providerId: string, start: Date, end: Date): Promise<boolean>;
  /** Live (not cancelled/rejected) bookings starting within the range. */
  abstract countLiveBetween(providerId: string, start: Date, end: Date): Promise<number>;
  /**
   * Persists a transition only if the status is still `change.from`
   * (optimistic concurrency) and appends the history row.
   * @throws ConcurrentBookingUpdateError when the status changed meanwhile.
   */
  abstract saveTransition(booking: Booking, change: StatusChange): Promise<Booking>;
  abstract appendHistory(change: StatusChange): Promise<void>;
  abstract setEstimatedAmount(id: string, amount: number): Promise<void>;
  abstract listForCustomer(
    customerId: string,
    filter: BookingListFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<BookingSummary>>;
  abstract listForProvider(
    providerId: string,
    filter: BookingListFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<BookingSummary>>;
  abstract listAll(
    filter: BookingListFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<BookingSummary>>;
}
