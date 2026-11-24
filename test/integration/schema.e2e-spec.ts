import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2-password-hasher.js';
import { seed } from '../../src/infrastructure/prisma/seed/seed.js';
import { type PrismaClient } from '../../src/infrastructure/prisma/generated/client.js';
import { createTestPrisma, resetDatabase } from '../utils/database.js';

const HOUR = 3_600_000;
const base = new Date('2030-01-06T04:00:00.000Z');
const at = (hours: number): Date => new Date(base.getTime() + hours * HOUR);

describe('Database schema & constraints (integration)', () => {
  let prisma: PrismaClient;
  let customerId: string;
  let providerId: string;
  let serviceId: string;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const customer = await prisma.user.create({
      data: { role: 'CUSTOMER', fullName: 'Customer', phone: '+9779811111111' },
    });
    const providerUser = await prisma.user.create({
      data: { role: 'PROVIDER', fullName: 'Provider', phone: '+9779822222222' },
    });
    const provider = await prisma.provider.create({
      data: { userId: providerUser.id, latitude: 27.7, longitude: 85.3 },
    });
    const category = await prisma.category.create({ data: { name: 'Plumber', slug: 'plumber' } });
    const service = await prisma.service.create({
      data: { categoryId: category.id, name: 'Leak Repair', slug: 'leak-repair' },
    });
    customerId = customer.id;
    providerId = provider.id;
    serviceId = service.id;
  });

  const booking = (start: Date, end: Date, extra: Record<string, unknown> = {}) =>
    prisma.booking.create({
      data: {
        customerId,
        providerId,
        serviceId,
        scheduledAt: start,
        scheduledEndAt: end,
        pricingType: 'FIXED',
        addressLine1: 'Ward 4',
        addressCity: 'Kathmandu',
        addressLatitude: 27.7,
        addressLongitude: 85.3,
        ...extra,
      },
    });

  it('enforces unique phone and email', async () => {
    await prisma.user.update({ where: { id: customerId }, data: { email: 'a@sewapro.local' } });
    await expect(
      prisma.user.create({ data: { role: 'CUSTOMER', fullName: 'X', phone: '+9779811111111' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.user.create({
        data: {
          role: 'CUSTOMER',
          fullName: 'X',
          phone: '+9779833333333',
          email: 'a@sewapro.local',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces foreign keys', async () => {
    await expect(
      prisma.address.create({
        data: {
          userId: '01900000-0000-7000-8000-000000000000',
          label: 'Home',
          line1: 'x',
          city: 'Kathmandu',
          latitude: 27.7,
          longitude: 85.3,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('blocks overlapping live bookings for the same provider', async () => {
    await booking(at(0), at(1));
    await expect(booking(at(0.5), at(1.5))).rejects.toThrow(/bookings_no_provider_overlap/);
    await expect(booking(at(1), at(2))).resolves.toBeDefined();
  });

  it('frees the slot when a booking is cancelled or rejected', async () => {
    const first = await booking(at(0), at(1));
    await prisma.booking.update({ where: { id: first.id }, data: { status: 'CANCELLED' } });
    const second = await booking(at(0), at(1));
    await prisma.booking.update({ where: { id: second.id }, data: { status: 'REJECTED' } });
    await expect(booking(at(0), at(1))).resolves.toBeDefined();
  });

  it('scopes idempotency keys per customer', async () => {
    await booking(at(0), at(1), { idempotencyKey: 'key-1' });
    await expect(booking(at(3), at(4), { idempotencyKey: 'key-1' })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('allows only one default address per user', async () => {
    const address = {
      userId: customerId,
      line1: 'x',
      city: 'Kathmandu',
      latitude: 27,
      longitude: 85,
    };
    await prisma.address.create({ data: { ...address, label: 'Home', isDefault: true } });
    await prisma.address.create({ data: { ...address, label: 'Office', isDefault: false } });
    await expect(
      prisma.address.create({ data: { ...address, label: 'Other', isDefault: true } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces check constraints on ratings, prices and quotation totals', async () => {
    const done = await booking(at(0), at(1), { status: 'COMPLETED' });
    const ratings = { serviceQuality: 5, professionalism: 5, punctuality: 5, communication: 5 };
    await expect(
      prisma.review.create({
        data: { bookingId: done.id, customerId, providerId, overall: 6, ...ratings },
      }),
    ).rejects.toThrow(/reviews_ratings_range_chk/);
    await expect(
      prisma.providerService.create({
        data: { providerId, serviceId, pricingType: 'QUOTATION', price: 100 },
      }),
    ).rejects.toThrow(/provider_services_price_chk/);
    await expect(
      prisma.quotation.create({
        data: {
          bookingId: done.id,
          providerId,
          labourCost: 100,
          materialCost: 50,
          total: 120,
          expiresAt: at(48),
        },
      }),
    ).rejects.toThrow(/quotations_amounts_chk/);
  });

  it('seeds idempotently', async () => {
    await resetDatabase(prisma);
    const hasher = new Argon2PasswordHasher();
    const options = {
      admin: { email: 'admin@sewapro.local', phone: '+9779800000000', password: 'admin-pass-123' },
      samplePassword: 'sample-pass-123',
    };
    const first = await seed(prisma, hasher, options);
    const counts = async () => ({
      users: await prisma.user.count(),
      services: await prisma.service.count(),
      providerServices: await prisma.providerService.count(),
      rules: await prisma.availabilityRule.count(),
    });
    const before = await counts();
    await seed(prisma, hasher, options);

    expect(first).toEqual({ categories: 6, services: 27, providers: 8, customers: 3 });
    expect(await counts()).toEqual(before);
    expect(before.users).toBe(12);
    expect(await prisma.provider.count({ where: { verificationStatus: 'VERIFIED' } })).toBe(8);
  });
});
