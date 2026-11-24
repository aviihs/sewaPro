import { beforeEach, describe, expect, it } from 'vitest';
import { aBooking, aBookingDetail } from '../../../../test/unit/fixtures/bookings.js';
import { aService } from '../../../../test/unit/fixtures/catalog.js';
import { aProvider } from '../../../../test/unit/fixtures/providers.js';
import { aUser } from '../../../../test/unit/fixtures/users.js';
import { FakeUnitOfWork, FixedClock, mockOf } from '../../../../test/unit/mock.js';
import { DomainEventPublisher } from '../../../common/ports/domain-events.port.js';
import {
  type Address,
  AddressNotFoundError,
  AddressRepository,
} from '../../addresses/domain/address.js';
import { ServiceRepository } from '../../catalog/domain/catalog.repositories.js';
import {
  AvailabilityRepository,
  OfferingRepository,
  ProviderRepository,
} from '../../providers/domain/provider.repositories.js';
import { ProviderNotFoundError } from '../../providers/domain/providers.errors.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { BookingRepository } from '../domain/booking.repository.js';
import { IdempotencyKeyReusedError, SlotUnavailableError } from '../domain/bookings.errors.js';
import { BookingSlotPolicy } from './booking-slot-policy.js';
import { CreateBookingUseCase } from './create-booking.use-case.js';

const clock = new FixedClock(new Date('2030-01-06T04:15:00Z'));
const scheduledAt = new Date('2030-01-07T04:15:00Z');
const address: Address = {
  id: 'addr-1',
  userId: 'cust-1',
  label: 'Home',
  line1: 'House 12',
  area: 'Baluwatar',
  city: 'Kathmandu',
  district: null,
  landmark: null,
  latitude: 27.72,
  longitude: 85.33,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const offering = {
  id: 'off-1',
  providerId: 'prov-1',
  serviceId: 'svc-1',
  serviceName: 'Fan',
  categoryId: 'cat-1',
  pricingType: 'FIXED' as const,
  price: 1500,
  description: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const input = {
  providerId: 'prov-1',
  serviceId: 'svc-1',
  addressId: 'addr-1',
  scheduledAt,
  problemDescription: null,
  idempotencyKey: null,
};

describe('CreateBookingUseCase', () => {
  const bookings = mockOf<BookingRepository>();
  const providers = mockOf<ProviderRepository>();
  const users = mockOf<UserRepository>();
  const addresses = mockOf<AddressRepository>();
  const offerings = mockOf<OfferingRepository>();
  const services = mockOf<ServiceRepository>();
  const availability = mockOf<AvailabilityRepository>();
  const events = mockOf<DomainEventPublisher>();
  const slots = new BookingSlotPolicy(bookings, offerings, services, availability);
  const useCase = new CreateBookingUseCase(
    bookings,
    providers,
    users,
    addresses,
    slots,
    events,
    clock,
    new FakeUnitOfWork(),
  );

  beforeEach(() => {
    providers.findById.mockResolvedValue(
      aProvider({ verificationStatus: 'VERIFIED', latitude: 27.7172, longitude: 85.324 }),
    );
    users.findById.mockResolvedValue(aUser({ status: 'ACTIVE' }));
    addresses.findOwned.mockResolvedValue(address);
    offerings.find.mockResolvedValue(offering);
    services.findById.mockResolvedValue(aService());
    availability.getSettings.mockResolvedValue({ maxDailyBookings: 2, slotMinutes: 60 });
    availability.getWindows.mockResolvedValue([
      { dayOfWeek: 1, startMinute: 540, endMinute: 1080 },
    ]);
    availability.listBlockedDates.mockResolvedValue([]);
    bookings.countLiveBetween.mockResolvedValue(0);
    bookings.hasOverlap.mockResolvedValue(false);
    bookings.create.mockResolvedValue(aBooking());
    bookings.findDetail.mockResolvedValue(aBookingDetail());
  });

  it('creates a pending booking with an address snapshot, history and event', async () => {
    const result = await useCase.execute('cust-1', { ...input, problemDescription: 'Noisy fan' });

    expect(result.replayed).toBe(false);
    expect(bookings.lockProviderSchedule).toHaveBeenCalledWith('prov-1');
    expect(bookings.create).toHaveBeenCalledWith({
      customerId: 'cust-1',
      providerId: 'prov-1',
      serviceId: 'svc-1',
      addressId: 'addr-1',
      scheduledAt,
      scheduledEndAt: new Date('2030-01-07T05:15:00Z'),
      problemDescription: 'Noisy fan',
      pricingType: 'FIXED',
      quotedPrice: 1500,
      address: {
        line1: 'House 12',
        area: 'Baluwatar',
        city: 'Kathmandu',
        landmark: null,
        latitude: 27.72,
        longitude: 85.33,
      },
      idempotencyKey: null,
    });
    expect(bookings.appendHistory).toHaveBeenCalledWith(
      expect.objectContaining({ from: null, to: 'PENDING', actorRole: 'CUSTOMER' }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'booking.created' }),
    );
  });

  it('replays an identical request with the same Idempotency-Key', async () => {
    bookings.findByIdempotencyKey.mockResolvedValue(aBooking({ scheduledAt }));
    const result = await useCase.execute('cust-1', { ...input, idempotencyKey: 'key-12345' });
    expect(result.replayed).toBe(true);
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('refuses a reused key with a different payload', async () => {
    bookings.findByIdempotencyKey.mockResolvedValue(aBooking({ serviceId: 'other' }));
    await expect(
      useCase.execute('cust-1', { ...input, idempotencyKey: 'key-12345' }),
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
  });

  it('fails for unknown providers and foreign addresses', async () => {
    providers.findById.mockResolvedValueOnce(null);
    await expect(useCase.execute('cust-1', input)).rejects.toBeInstanceOf(ProviderNotFoundError);
    addresses.findOwned.mockResolvedValueOnce(null);
    await expect(useCase.execute('cust-1', input)).rejects.toBeInstanceOf(AddressNotFoundError);
  });

  const ruleCases: [string, string, () => void][] = [
    [
      'unverified provider',
      'PROVIDER_NOT_BOOKABLE',
      () => providers.findById.mockResolvedValueOnce(aProvider()),
    ],
    [
      'suspended provider account',
      'PROVIDER_NOT_BOOKABLE',
      () => users.findById.mockResolvedValueOnce(aUser({ status: 'SUSPENDED' })),
    ],
    [
      'service not offered',
      'SERVICE_NOT_OFFERED',
      () => offerings.find.mockResolvedValueOnce(null),
    ],
    [
      'inactive catalog service',
      'SERVICE_NOT_OFFERED',
      () => services.findById.mockResolvedValueOnce(aService({ isActive: false })),
    ],
    [
      'outside working hours',
      'OUTSIDE_AVAILABILITY',
      () => availability.getWindows.mockResolvedValueOnce([]),
    ],
    [
      'blocked day',
      'OUTSIDE_AVAILABILITY',
      () =>
        availability.listBlockedDates.mockResolvedValueOnce([
          { id: 'b', providerId: 'prov-1', date: '2030-01-07', reason: null },
        ]),
    ],
    [
      'address too far',
      'OUT_OF_SERVICE_AREA',
      () =>
        addresses.findOwned.mockResolvedValueOnce({ ...address, latitude: 28.2, longitude: 83.98 }),
    ],
    [
      'daily cap reached',
      'DAILY_BOOKING_LIMIT_REACHED',
      () => bookings.countLiveBetween.mockResolvedValueOnce(2),
    ],
  ];

  it.each(ruleCases)('enforces rule: %s', async (_label, code, arrange) => {
    arrange();
    await expect(useCase.execute('cust-1', input)).rejects.toMatchObject({ code });
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('enforces lead time and booking horizon', async () => {
    await expect(
      useCase.execute('cust-1', { ...input, scheduledAt: new Date('2030-01-06T04:30:00Z') }),
    ).rejects.toMatchObject({
      code: 'BOOKING_TIME_IN_PAST',
    });
    await expect(
      useCase.execute('cust-1', { ...input, scheduledAt: new Date('2030-04-01T04:15:00Z') }),
    ).rejects.toMatchObject({
      code: 'BOOKING_TIME_TOO_FAR',
    });
  });

  it('rejects an overlapping slot', async () => {
    bookings.hasOverlap.mockResolvedValueOnce(true);
    await expect(useCase.execute('cust-1', input)).rejects.toBeInstanceOf(SlotUnavailableError);
  });
});
