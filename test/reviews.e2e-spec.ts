import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestUser, createUser } from './utils/auth.js';
import { book, createAddress, nepalSlot } from './utils/bookings.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { completedBooking } from './utils/lifecycle.js';
import { registerProvider, verifiedProvider } from './utils/providers.js';

const ratings = (overall: number) => ({
  overall,
  serviceQuality: overall,
  professionalism: 5,
  punctuality: 4,
  communication: 5,
});

describe('Reviews (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let provider: Awaited<ReturnType<typeof verifiedProvider>>;

  const review = (user: TestUser, bookingId: string, body: object) =>
    ctx.http().post(`/api/v1/bookings/${bookingId}/review`).set(user.auth).send(body);
  const providerRow = () =>
    ctx.prisma.provider.findUniqueOrThrow({ where: { id: provider.providerId } });

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
    provider = await verifiedProvider(ctx, admin);
  });

  it('reviews completed bookings once, recomputes ratings, lists publicly and moderates', async () => {
    const aarati = await createUser(ctx, 'CUSTOMER', { fullName: 'Aarati Kumari Sharma' });
    const nabin = await createUser(ctx, 'CUSTOMER', { fullName: 'Nabin Rai' });
    const first = await completedBooking(ctx, aarati, provider, 2);
    const second = await completedBooking(ctx, nabin, provider, 3);

    const created = await review(aarati, first, {
      ...ratings(5),
      comment: 'Excellent work',
    }).expect(201);
    expect(created.body.data).toMatchObject({
      customerName: 'Aarati S.',
      overall: 5,
      comment: 'Excellent work',
    });
    expect((await review(aarati, first, ratings(4)).expect(409)).body.error.code).toBe(
      'REVIEW_ALREADY_EXISTS',
    );
    await review(nabin, second, ratings(2)).expect(201);
    expect(await providerRow()).toMatchObject({ ratingCount: 2 });
    expect((await providerRow()).ratingAverage.toNumber()).toBe(3.5);

    const publicList = await ctx
      .http()
      .get(`/api/v1/providers/${provider.providerId}/reviews?limit=1`)
      .expect(200);
    expect(publicList.body.meta).toMatchObject({ totalItems: 2, totalPages: 2 });
    expect(JSON.stringify(publicList.body)).not.toContain('Sharma');

    const low = await ctx
      .http()
      .get('/api/v1/admin/reviews?maxOverall=2')
      .set(admin.auth)
      .expect(200);
    expect(low.body.data).toHaveLength(1);
    const lowId = low.body.data[0].id as string;
    const hidden = await ctx
      .http()
      .post(`/api/v1/admin/reviews/${lowId}/hide`)
      .set(admin.auth)
      .send({ reason: 'Abusive language' })
      .expect(200);
    expect(hidden.body.data).toMatchObject({
      hiddenReason: 'Abusive language',
      customerName: 'Nabin Rai',
    });
    await ctx
      .http()
      .post(`/api/v1/admin/reviews/${lowId}/hide`)
      .set(admin.auth)
      .send({ reason: 'Abusive language' })
      .expect(409);

    const after = await providerRow();
    expect(after.ratingCount).toBe(1);
    expect(after.ratingAverage.toNumber()).toBe(5);
    expect(
      (await ctx.http().get(`/api/v1/providers/${provider.providerId}/reviews`).expect(200)).body
        .data,
    ).toHaveLength(1);
    expect(
      (await ctx.http().get('/api/v1/admin/reviews?hidden=true').set(admin.auth).expect(200)).body
        .data,
    ).toHaveLength(1);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'review.hidden' } })).toBe(1);
  });

  it('refuses reviews of unfinished or foreign bookings and invalid ratings', async () => {
    const customer = await createUser(ctx, 'CUSTOMER');
    const addressId = await createAddress(ctx, customer);
    const pending = await book(ctx, customer, {
      providerId: provider.providerId,
      serviceId: provider.serviceId,
      addressId,
      scheduledAt: nepalSlot(2, 9),
    }).expect(201);
    const notDone = await review(customer, pending.body.data.id as string, ratings(5)).expect(422);
    expect(notDone.body.error.code).toBe('BOOKING_NOT_REVIEWABLE');

    const done = await completedBooking(ctx, customer, provider, 4);
    const stranger = await createUser(ctx, 'CUSTOMER');
    await review(stranger, done, ratings(5)).expect(404);
    const invalid = await review(customer, done, { ...ratings(6), punctuality: 0 }).expect(400);
    expect((invalid.body.error.details as { field: string }[]).map((d) => d.field).sort()).toEqual([
      'overall',
      'punctuality',
      'serviceQuality',
    ]);
    await review(provider, done, ratings(5)).expect(403);
  });

  it('protects moderation and hides unverified providers', async () => {
    const customer = await createUser(ctx, 'CUSTOMER');
    await ctx.http().get('/api/v1/admin/reviews').set(customer.auth).expect(403);
    await ctx
      .http()
      .post('/api/v1/admin/reviews/01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f/hide')
      .set(admin.auth)
      .send({ reason: 'whatever' })
      .expect(404);
    const pending = await registerProvider(ctx);
    await ctx.http().get(`/api/v1/providers/${pending.providerId}/reviews`).expect(404);
  });
});
