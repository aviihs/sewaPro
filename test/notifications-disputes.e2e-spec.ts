import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestUser, createUser } from './utils/auth.js';
import { book, createAddress, nepalSlot, providerAction } from './utils/bookings.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { completedBooking } from './utils/lifecycle.js';
import { verifiedProvider } from './utils/providers.js';

describe('Notifications, disputes & audit (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let customer: TestUser;
  let provider: Awaited<ReturnType<typeof verifiedProvider>>;

  const types = async (user: TestUser): Promise<string[]> => {
    const res = await ctx.http().get('/api/v1/notifications?limit=100').set(user.auth).expect(200);
    return (res.body.data as { type: string }[]).map((n) => n.type);
  };

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
    customer = await createUser(ctx, 'CUSTOMER');
    provider = await verifiedProvider(ctx, admin);
  });

  it('notifies both sides through the booking lifecycle', async () => {
    expect(await types(provider)).toEqual(['PROVIDER_VERIFIED']);
    await completedBooking(ctx, customer, provider);

    expect(await types(provider)).toEqual(['BOOKING_CREATED', 'PROVIDER_VERIFIED']);
    expect(await types(customer)).toEqual([
      'BOOKING_COMPLETED',
      'BOOKING_STATUS_CHANGED',
      'BOOKING_STATUS_CHANGED',
      'BOOKING_ACCEPTED',
    ]);
  });

  it('paginates with a cursor, counts unread and marks read (no IDOR)', async () => {
    await completedBooking(ctx, customer, provider);
    const first = await ctx
      .http()
      .get('/api/v1/notifications?limit=3')
      .set(customer.auth)
      .expect(200);
    expect(first.body.data).toHaveLength(3);
    expect(first.body.meta).toMatchObject({ limit: 3, hasMore: true });
    const second = await ctx
      .http()
      .get(`/api/v1/notifications?limit=3&cursor=${first.body.meta.nextCursor as string}`)
      .set(customer.auth)
      .expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta).toEqual({ limit: 3, hasMore: false, nextCursor: null });
    await ctx.http().get('/api/v1/notifications?cursor=garbage').set(customer.auth).expect(400);

    const count = () =>
      ctx.http().get('/api/v1/notifications/unread-count').set(customer.auth).expect(200);
    expect((await count()).body.data).toEqual({ unread: 4 });
    const id = first.body.data[0].id as string;
    await ctx.http().post(`/api/v1/notifications/${id}/read`).set(provider.auth).expect(404);
    await ctx.http().post(`/api/v1/notifications/${id}/read`).set(customer.auth).expect(204);
    await ctx.http().post(`/api/v1/notifications/${id}/read`).set(customer.auth).expect(204);
    expect((await count()).body.data).toEqual({ unread: 3 });
    expect(
      (await ctx.http().get('/api/v1/notifications?unreadOnly=true').set(customer.auth).expect(200))
        .body.data,
    ).toHaveLength(3);
    expect(
      (await ctx.http().post('/api/v1/notifications/read-all').set(customer.auth).expect(200)).body
        .data,
    ).toEqual({ marked: 3 });
    expect((await count()).body.data).toEqual({ unread: 0 });
    await ctx.http().get('/api/v1/notifications').expect(401);
  });

  it('runs a dispute from in-progress to admin resolution', async () => {
    const addressId = await createAddress(ctx, customer);
    const created = await book(ctx, customer, {
      providerId: provider.providerId,
      serviceId: provider.serviceId,
      addressId,
      scheduledAt: nepalSlot(2, 10),
    }).expect(201);
    const bookingId = created.body.data.id as string;
    const raise = (user: TestUser) =>
      ctx.http().post('/api/v1/disputes').set(user.auth).send({
        bookingId,
        reason: 'Work left unfinished',
        description: 'Provider left after one of three sockets.',
      });

    expect((await raise(customer).expect(422)).body.error.code).toBe('BOOKING_NOT_DISPUTABLE');
    for (const action of ['accept', 'on-the-way', 'start'])
      await providerAction(ctx, provider, bookingId, action).expect(200);
    const stranger = await createUser(ctx, 'CUSTOMER');
    await raise(stranger).expect(404);
    await raise(admin).expect(403);

    const dispute = await raise(customer).expect(201);
    const disputeId = dispute.body.data.id as string;
    expect(dispute.body.data).toMatchObject({ status: 'OPEN', raisedByRole: 'CUSTOMER' });
    expect((await raise(provider).expect(409)).body.error.code).toBe('DISPUTE_ALREADY_OPEN');
    expect(
      (await ctx.http().get(`/api/v1/bookings/${bookingId}`).set(customer.auth).expect(200)).body
        .data.status,
    ).toBe('DISPUTED');
    expect(await types(provider)).toContain('DISPUTE_OPENED');

    await ctx.http().get(`/api/v1/disputes/${disputeId}`).set(provider.auth).expect(200);
    await ctx.http().get(`/api/v1/disputes/${disputeId}`).set(stranger.auth).expect(404);
    expect(
      (await ctx.http().get('/api/v1/disputes').set(provider.auth).expect(200)).body.meta
        .totalItems,
    ).toBe(1);
    expect(
      (await ctx.http().get('/api/v1/disputes').set(stranger.auth).expect(200)).body.meta
        .totalItems,
    ).toBe(0);
    await ctx
      .http()
      .post(`/api/v1/admin/disputes/${disputeId}/review`)
      .set(customer.auth)
      .expect(403);
    await ctx.http().post(`/api/v1/admin/disputes/${disputeId}/review`).set(admin.auth).expect(200);

    const noAmount = await ctx
      .http()
      .post(`/api/v1/admin/disputes/${disputeId}/resolve`)
      .set(admin.auth)
      .send({ outcome: 'BOOKING_COMPLETED', resolution: 'Provider returned and finished.' })
      .expect(422);
    expect(noAmount.body.error.code).toBe('FINAL_AMOUNT_REQUIRED');
    const resolved = await ctx
      .http()
      .post(`/api/v1/admin/disputes/${disputeId}/resolve`)
      .set(admin.auth)
      .send({
        outcome: 'BOOKING_COMPLETED',
        resolution: 'Provider returned and finished.',
        finalAmount: 1200,
      })
      .expect(200);
    expect(resolved.body.data).toMatchObject({ status: 'RESOLVED', outcome: 'BOOKING_COMPLETED' });

    const booking = await ctx
      .http()
      .get(`/api/v1/bookings/${bookingId}`)
      .set(customer.auth)
      .expect(200);
    expect(booking.body.data).toMatchObject({ status: 'COMPLETED', finalAmount: 1200 });
    expect(
      (await ctx.prisma.provider.findUniqueOrThrow({ where: { id: provider.providerId } }))
        .completedJobs,
    ).toBe(1);
    expect(await types(customer)).toContain('DISPUTE_RESOLVED');
    expect(await types(provider)).toContain('DISPUTE_RESOLVED');
    await ctx
      .http()
      .post(`/api/v1/admin/disputes/${disputeId}/resolve`)
      .set(admin.auth)
      .send({ outcome: 'BOOKING_CANCELLED', resolution: 'Second thoughts here' })
      .expect(409);
  });

  it('exposes a filterable, admin-only audit log fed by admin actions and events', async () => {
    const addressId = await createAddress(ctx, customer);
    const res = await book(ctx, customer, {
      providerId: provider.providerId,
      serviceId: provider.serviceId,
      addressId,
      scheduledAt: nepalSlot(2, 12),
    }).expect(201);
    await ctx
      .http()
      .post(`/api/v1/bookings/${res.body.data.id as string}/cancel`)
      .set(customer.auth)
      .send({ reason: 'Changed plans' })
      .expect(200);

    const all = await ctx.http().get('/api/v1/admin/audit-logs').set(admin.auth).expect(200);
    expect(all.body.data.map((e: { action: string }) => e.action)).toEqual([
      'booking.cancelled',
      'provider.verified',
    ]);
    const cancelled = await ctx
      .http()
      .get('/api/v1/admin/audit-logs?action=booking.cancelled')
      .set(admin.auth)
      .expect(200);
    expect(cancelled.body.data[0]).toMatchObject({
      actorId: customer.id,
      actorRole: 'CUSTOMER',
      entityType: 'Booking',
      after: { status: 'CANCELLED', reason: 'Changed plans' },
    });
    const byAdmin = await ctx
      .http()
      .get(`/api/v1/admin/audit-logs?actorId=${admin.id}`)
      .set(admin.auth)
      .expect(200);
    expect(byAdmin.body.data[0]).toMatchObject({
      action: 'provider.verified',
      ipAddress: expect.any(String),
      requestId: expect.any(String),
    });
    await ctx.http().get('/api/v1/admin/audit-logs?action=DROP TABLE').set(admin.auth).expect(400);
    await ctx.http().get('/api/v1/admin/audit-logs').set(customer.auth).expect(403);
  });
});
