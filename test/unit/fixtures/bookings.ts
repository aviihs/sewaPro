import { Booking, type BookingProps } from '../../../src/modules/bookings/domain/booking.js';
import { type BookingDetail } from '../../../src/modules/bookings/domain/booking.repository.js';

const at = new Date('2030-01-06T10:00:00Z');

export const aBooking = (overrides: Partial<BookingProps> = {}): Booking =>
  Booking.restore({
    id: 'bk-1',
    customerId: 'cust-1',
    providerId: 'prov-1',
    providerUserId: 'user-p1',
    serviceId: 'svc-1',
    status: 'PENDING',
    scheduledAt: new Date('2030-01-07T04:15:00Z'),
    scheduledEndAt: new Date('2030-01-07T05:15:00Z'),
    problemDescription: null,
    pricingType: 'FIXED',
    quotedPrice: 1500,
    estimatedAmount: null,
    finalAmount: null,
    address: {
      line1: 'House 12',
      area: 'Baluwatar',
      city: 'Kathmandu',
      landmark: null,
      latitude: 27.72,
      longitude: 85.33,
    },
    cancelReason: null,
    rejectionReason: null,
    idempotencyKey: null,
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

export const aBookingDetail = (overrides: Partial<BookingProps> = {}): BookingDetail => ({
  booking: aBooking(overrides),
  serviceName: 'Fan Installation',
  customer: { fullName: 'Aarati Sharma', phone: '+9779841111111' },
  provider: { businessName: 'Thapa Electricals', fullName: 'Ram Thapa', phone: '+9779842222222' },
  history: [],
});
