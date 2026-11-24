import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestUser, createUser } from './utils/auth.js';
import { book, createAddress, nepalSlot, providerAction } from './utils/bookings.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { registerProvider, verifiedProvider } from './utils/providers.js';

describe('Bookings (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let customer: TestUser;
  let provider: Awaited<ReturnType<typeof verifiedProvider>>;
  let addressId: string;
  const request = (scheduledAt = nepalSlot(2, 10)) => ({
    providerId: provider.providerId,
    serviceId: provider.serviceId,
    addressId,
    scheduledAt,
  });

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
    await rm('.tmp/storage-test', { recursive: true, force: true });
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = await createUser(ctx, 'ADMIN');
    customer = await createUser(ctx, 'CUSTOMER', { fullName: 'Aarati Sharma' });
    provider = await verifiedProvider(ctx, admin);
    addressId = await createAddress(ctx, customer);
  });

  it('runs the full lifecycle and reveals contact details only after acceptance', async () => {
    const created = await book(ctx, customer, request()).expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data).toMatchObject({
      status: 'PENDING',
      quotedPrice: 1500,
      pricingType: 'FIXED',
      provider: { phone: null },
    });
    expect(created.body.data.address.line1).toBe('House 12, Ward 4');

    const hidden = await ctx
      .http()
      .get(`/api/v1/providers/me/bookings/${id}`)
      .set(provider.auth)
      .expect(200);
    expect(hidden.body.data.customer).toEqual({ name: 'Aarati Sharma', phone: null });
    expect(hidden.body.data.address).toMatchObject({
      line1: null,
      landmark: null,
      latitude: null,
      area: 'Baluwatar',
      city: 'Kathmandu',
    });

    const accepted = await providerAction(ctx, provider, id, 'accept').expect(200);
    expect(accepted.body.data.customer.phone).toBe(customer.phone);
    expect(accepted.body.data.address).toMatchObject({
      line1: 'House 12, Ward 4',
      latitude: 27.7215,
    });
    const customerView = await ctx
      .http()
      .get(`/api/v1/bookings/${id}`)
      .set(customer.auth)
      .expect(200);
    expect(customerView.body.data.provider.phone).toBe(provider.phone);

    await providerAction(ctx, provider, id, 'on-the-way').expect(200);
    await providerAction(ctx, provider, id, 'start').expect(200);
    const done = await providerAction(ctx, provider, id, 'complete', {
      finalAmount: 1750.5,
    }).expect(200);
    expect(done.body.data).toMatchObject({ status: 'COMPLETED', finalAmount: 1750.5 });
    expect(done.body.data.history.map((h: { to: string }) => h.to)).toEqual([
      'PENDING',
      'ACCEPTED',
      'ON_THE_WAY',
      'IN_PROGRESS',
      'COMPLETED',
    ]);

    const stored = await ctx.prisma.provider.findUniqueOrThrow({
      where: { id: provider.providerId },
    });
    expect(stored.completedJobs).toBe(1);
    const earnings = await ctx
      .http()
      .get('/api/v1/providers/me/earnings-summary')
      .set(provider.auth)
      .expect(200);
    expect(earnings.body.data.allTime).toEqual({ completedJobs: 1, totalAmount: 1750.5 });
    const list = await ctx
      .http()
      .get('/api/v1/bookings?status=COMPLETED')
      .set(customer.auth)
      .expect(200);
    expect(list.body.data[0]).toMatchObject({
      id,
      counterpartName: 'Thapa Electricals',
      finalAmount: 1750.5,
    });
  });

  it('replays an Idempotency-Key and refuses it for a different request', async () => {
    const first = await book(ctx, customer, request(), 'retry-key-0001').expect(201);
    const replay = await book(ctx, customer, request(), 'retry-key-0001').expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    const reused = await book(ctx, customer, request(nepalSlot(3, 11)), 'retry-key-0001').expect(
      409,
    );
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    await book(ctx, customer, request(), 'bad key!').expect(400);
    expect(await ctx.prisma.booking.count()).toBe(1);
  });

  it('prevents double booking, even under concurrent requests, and frees cancelled slots', async () => {
    const others = await Promise.all(
      [1, 2, 3, 4, 5].map(async () => {
        const user = await createUser(ctx, 'CUSTOMER');
        return { user, addressId: await createAddress(ctx, user) };
      }),
    );
    const slot = nepalSlot(2, 14);
    const results = await Promise.all(
      others.map(({ user, addressId: addr }) =>
        book(ctx, user, { ...request(slot), addressId: addr }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(
      results
        .filter((r) => r.status === 409)
        .every((r) => r.body.error.code === 'SLOT_UNAVAILABLE'),
    ).toBe(true);

    const overlapping = await book(ctx, customer, request(nepalSlot(2, 14, 30))).expect(409);
    expect(overlapping.body.error.code).toBe('SLOT_UNAVAILABLE');

    const winnerIndex = results.findIndex((r) => r.status === 201);
    const winnerId = results[winnerIndex]?.body.data.id as string;
    const owner = others[winnerIndex];
    await ctx
      .http()
      .post(`/api/v1/bookings/${winnerId}/cancel`)
      .set(owner.user.auth)
      .send({ reason: 'Plans changed' })
      .expect(200);
    await book(ctx, customer, request(slot)).expect(201);
  });

  it('enforces booking rules', async () => {
    const code = async (body: object, status: number): Promise<string> => {
      const res = await book(ctx, customer, { ...request(), ...body }).expect(status);
      return (res.body as { error: { code: string } }).error.code;
    };
    expect(await code({ scheduledAt: new Date(Date.now() + 60_000).toISOString() }, 422)).toBe(
      'BOOKING_TIME_IN_PAST',
    );
    expect(await code({ scheduledAt: nepalSlot(2, 22) }, 422)).toBe('OUTSIDE_AVAILABILITY');
    expect(await code({ scheduledAt: 'tomorrow' }, 400)).toBe('VALIDATION_FAILED');

    const pending = await registerProvider(ctx);
    expect(await code({ providerId: pending.providerId }, 422)).toBe('PROVIDER_NOT_BOOKABLE');
    const intruder = await createUser(ctx, 'CUSTOMER');
    const foreignAddress = await createAddress(ctx, intruder);
    expect(await code({ addressId: foreignAddress }, 404)).toBe('ADDRESS_NOT_FOUND');

    await ctx
      .http()
      .patch('/api/v1/providers/me/settings')
      .set(provider.auth)
      .send({ maxDailyBookings: 1 })
      .expect(200);
    await book(ctx, customer, request(nepalSlot(4, 9))).expect(201);
    expect(await code({ scheduledAt: nepalSlot(4, 15) }, 422)).toBe('DAILY_BOOKING_LIMIT_REACHED');
  });

  it('protects every booking route by role and ownership', async () => {
    const id = (await book(ctx, customer, request()).expect(201)).body.data.id as string;
    const otherCustomer = await createUser(ctx, 'CUSTOMER');
    const otherProvider = await verifiedProvider(ctx, admin);

    await ctx.http().get(`/api/v1/bookings/${id}`).set(otherCustomer.auth).expect(404);
    await ctx
      .http()
      .post(`/api/v1/bookings/${id}/cancel`)
      .set(otherCustomer.auth)
      .send({})
      .expect(404);
    await ctx.http().get(`/api/v1/providers/me/bookings/${id}`).set(otherProvider.auth).expect(404);
    await providerAction(ctx, otherProvider, id, 'accept').expect(404);
    await ctx.http().post('/api/v1/bookings').set(provider.auth).send(request()).expect(403);
    await providerAction(ctx, customer, id, 'accept').expect(403);
    await ctx.http().get('/api/v1/bookings').expect(401);

    const illegal = await providerAction(ctx, provider, id, 'start').expect(409);
    expect(illegal.body.error.code).toBe('BOOKING_INVALID_TRANSITION');
    await providerAction(ctx, provider, id, 'reject', { reason: 'No' }).expect(400);
    await providerAction(ctx, provider, id, 'reject', { reason: 'Fully booked' }).expect(200);
    await ctx.http().post(`/api/v1/bookings/${id}/cancel`).set(customer.auth).send({}).expect(409);
  });
});
