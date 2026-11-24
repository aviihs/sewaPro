import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/ports/clock.port.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { AddressNotFoundError, AddressRepository } from '../../addresses/domain/address.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { UserStatus } from '../../users/domain/user.js';
import { ProviderRepository } from '../../providers/domain/provider.repositories.js';
import { ProviderNotFoundError } from '../../providers/domain/providers.errors.js';
import { type Booking } from '../domain/booking.js';
import { BookingCreatedEvent } from '../domain/booking.events.js';
import { type BookingDetail, BookingRepository } from '../domain/booking.repository.js';
import { BookingNotFoundError, IdempotencyKeyReusedError } from '../domain/bookings.errors.js';
import { BookingSlotPolicy } from './booking-slot-policy.js';

export interface CreateBookingInput {
  readonly providerId: string;
  readonly serviceId: string;
  readonly addressId: string;
  readonly scheduledAt: Date;
  readonly problemDescription: string | null;
  readonly idempotencyKey: string | null;
}

export interface CreatedBooking {
  readonly detail: BookingDetail;
  /** True when an earlier request with the same Idempotency-Key is being returned. */
  readonly replayed: boolean;
}

const sameRequest = (b: Booking, input: CreateBookingInput): boolean =>
  b.providerId === input.providerId &&
  b.serviceId === input.serviceId &&
  b.scheduledAt.getTime() === input.scheduledAt.getTime();

/**
 * Books a provider. Checks (in order): idempotency replay, provider bookable,
 * service offered, time window, availability, address ownership and service
 * area; then, under a per-provider lock, the daily cap and overlap. The DB
 * exclusion constraint is the final guard against double booking.
 */
@Injectable()
export class CreateBookingUseCase {
  constructor(
    private readonly bookings: BookingRepository,
    private readonly providers: ProviderRepository,
    private readonly users: UserRepository,
    private readonly addresses: AddressRepository,
    private readonly slots: BookingSlotPolicy,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(customerId: string, input: CreateBookingInput): Promise<CreatedBooking> {
    const replay = await this.findReplay(customerId, input);
    if (replay) return { detail: await this.load(replay.id), replayed: true };

    const provider = await this.providers.findById(input.providerId);
    if (!provider) throw new ProviderNotFoundError();
    const owner = await this.users.findById(provider.userId);
    const address = await this.addresses.findOwned(input.addressId, customerId);
    if (!address) throw new AddressNotFoundError();
    const plan = await this.slots.plan(
      provider,
      owner?.status !== UserStatus.SUSPENDED,
      input,
      address,
      this.clock.now(),
    );

    const booking = await this.uow.run(async () => {
      await this.bookings.lockProviderSchedule(provider.id);
      await this.slots.assertCapacity(provider.id, plan);
      const created = await this.bookings.create({
        customerId,
        providerId: provider.id,
        serviceId: input.serviceId,
        addressId: address.id,
        scheduledAt: input.scheduledAt,
        scheduledEndAt: plan.end,
        problemDescription: input.problemDescription,
        pricingType: plan.offering.pricingType,
        quotedPrice: plan.offering.price,
        address: {
          line1: address.line1,
          area: address.area,
          city: address.city,
          landmark: address.landmark,
          latitude: address.latitude,
          longitude: address.longitude,
        },
        idempotencyKey: input.idempotencyKey,
      });
      await this.bookings.appendHistory({
        bookingId: created.id,
        from: null,
        to: created.status,
        actorId: customerId,
        actorRole: 'CUSTOMER',
        note: null,
        at: created.createdAt,
      });
      return created;
    });

    await this.events.publish(
      new BookingCreatedEvent(
        {
          bookingId: booking.id,
          customerId,
          providerId: booking.providerId,
          providerUserId: booking.providerUserId,
          scheduledAt: booking.scheduledAt,
        },
        this.clock.now(),
      ),
    );
    return { detail: await this.load(booking.id), replayed: false };
  }

  private async load(bookingId: string): Promise<BookingDetail> {
    const detail = await this.bookings.findDetail(bookingId);
    if (!detail) throw new BookingNotFoundError();
    return detail;
  }

  private async findReplay(customerId: string, input: CreateBookingInput): Promise<Booking | null> {
    if (!input.idempotencyKey) return null;
    const existing = await this.bookings.findByIdempotencyKey(customerId, input.idempotencyKey);
    if (existing && !sameRequest(existing, input)) throw new IdempotencyKeyReusedError();
    return existing;
  }
}
