import { Injectable } from '@nestjs/common';
import { distanceKm } from '../../../common/geo/distance.js';
import { nepalDayRange, toNepalTime } from '../../../common/time/nepal-time.js';
import { type Address } from '../../addresses/domain/address.js';
import { ServiceRepository } from '../../catalog/domain/catalog.repositories.js';
import { fitsAvailability, type ProviderSettings } from '../../providers/domain/availability.js';
import { type ProviderOffering } from '../../providers/domain/offering.js';
import { type Provider } from '../../providers/domain/provider.js';
import {
  AvailabilityRepository,
  OfferingRepository,
} from '../../providers/domain/provider.repositories.js';
import { BookingRepository } from '../domain/booking.repository.js';
import { BookingRule, SlotUnavailableError } from '../domain/bookings.errors.js';

export const BOOKING_LIMITS = {
  /** Earliest a booking may start, from now. */
  minLeadMinutes: 30,
  /** Furthest ahead a booking may be made. */
  maxAdvanceDays: 60,
} as const;

export interface SlotPlan {
  readonly start: Date;
  readonly end: Date;
  readonly offering: ProviderOffering;
  readonly settings: ProviderSettings;
}

interface SlotRequest {
  readonly serviceId: string;
  readonly scheduledAt: Date;
}

/** Booking-time rules that need provider data (kept out of the use case for size and reuse). */
@Injectable()
export class BookingSlotPolicy {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly offerings: OfferingRepository,
    private readonly services: ServiceRepository,
    private readonly availability: AvailabilityRepository,
  ) {}

  /** Validates everything that does not need the per-provider lock. */
  async plan(
    provider: Provider,
    ownerActive: boolean,
    request: SlotRequest,
    address: Address,
    now: Date,
  ): Promise<SlotPlan> {
    if (!provider.isBookable || !ownerActive) throw BookingRule.providerNotBookable();

    const [offering, service] = await Promise.all([
      this.offerings.find(provider.id, request.serviceId),
      this.services.findById(request.serviceId),
    ]);
    if (!offering?.isActive || !service?.isActive) throw BookingRule.serviceNotOffered();

    const start = request.scheduledAt;
    if (start.getTime() < now.getTime() + BOOKING_LIMITS.minLeadMinutes * 60_000)
      throw BookingRule.inPast();
    if (start.getTime() > now.getTime() + BOOKING_LIMITS.maxAdvanceDays * 86_400_000) {
      throw BookingRule.tooFar(BOOKING_LIMITS.maxAdvanceDays);
    }

    const date = toNepalTime(start).date;
    const [settings, windows, blocked] = await Promise.all([
      this.availability.getSettings(provider.id),
      this.availability.getWindows(provider.id),
      this.availability.listBlockedDates(provider.id, date),
    ]);
    const blockedDates = blocked.map((b) => b.date);
    if (!fitsAvailability(windows, blockedDates, start, settings.slotMinutes))
      throw BookingRule.outsideAvailability();

    const distance = distanceKm(provider, address);
    if (distance > provider.serviceRadiusKm) {
      throw BookingRule.outOfArea(Math.round(distance * 10) / 10, provider.serviceRadiusKm);
    }
    return {
      start,
      end: new Date(start.getTime() + settings.slotMinutes * 60_000),
      offering,
      settings,
    };
  }

  /** Call inside the transaction, after locking the provider's schedule. */
  async assertCapacity(providerId: string, plan: SlotPlan): Promise<void> {
    const day = nepalDayRange(toNepalTime(plan.start).date);
    const booked = await this.bookings.countLiveBetween(providerId, day.start, day.end);
    if (booked >= plan.settings.maxDailyBookings)
      throw BookingRule.dailyLimit(plan.settings.maxDailyBookings);
    if (await this.bookings.hasOverlap(providerId, plan.start, plan.end))
      throw new SlotUnavailableError();
  }
}
