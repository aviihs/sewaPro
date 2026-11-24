import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QuotationExpiryJob } from '../src/modules/quotations/infrastructure/quotation-expiry.job.js';
import { type TestUser, createUser } from './utils/auth.js';
import { book, createAddress, nepalSlot, providerAction } from './utils/bookings.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { verifiedProvider } from './utils/providers.js';

describe('Quotations (e2e)', () => {
  let ctx: TestContext;
  let customer: TestUser;
  let provider: Awaited<ReturnType<typeof verifiedProvider>>;
  let bookingId: string;

  const draft = (body: object = { labourCost: 1500.4, materialCost: 650.2, note: 'Replace MCB' }) =>
    ctx
      .http()
      .post(`/api/v1/providers/me/bookings/${bookingId}/quotations`)
      .set(provider.auth)
      .send(body);
  const send = (id: string) =>
    ctx.http().post(`/api/v1/providers/me/quotations/${id}/send`).set(provider.auth);
  const respond = (id: string, action: 'accept' | 'decline', user = customer) =>
    ctx.http().post(`/api/v1/bookings/${bookingId}/quotations/${id}/${action}`).set(user.auth);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
    await rm('.tmp/storage-test', { recursive: true, force: true });
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const admin = await createUser(ctx, 'ADMIN');
    customer = await createUser(ctx, 'CUSTOMER');
    provider = await verifiedProvider(ctx, admin, { pricingType: 'QUOTATION' });
    const addressId = await createAddress(ctx, customer);
    const res = await book(ctx, customer, {
      providerId: provider.providerId,
      serviceId: provider.serviceId,
      addressId,
      scheduledAt: nepalSlot(2, 11),
    }).expect(201);
    bookingId = res.body.data.id as string;
  });

  it('drafts, sends and accepts: total computed by the server, booking confirmed, audit written', async () => {
    const created = await draft({ labourCost: 1500.4, materialCost: 650.2, total: 1 }).expect(400);
    expect(created.body.error.details[0].field).toBe('total');

    const quotation = await draft().expect(201);
    expect(quotation.body.data).toMatchObject({ status: 'DRAFT', total: 2150.6 });
    const id = quotation.body.data.id as string;
    expect(
      (
        await ctx
          .http()
          .get(`/api/v1/bookings/${bookingId}/quotations`)
          .set(customer.auth)
          .expect(200)
      ).body.data,
    ).toEqual([]);
    await respond(id, 'accept').expect(409);

    await send(id).expect(200);
    expect((await draft().expect(409)).body.error.code).toBe('QUOTATION_ALREADY_OPEN');
    const accepted = await respond(id, 'accept').expect(200);
    expect(accepted.body.data.status).toBe('ACCEPTED');

    const booking = await ctx
      .http()
      .get(`/api/v1/bookings/${bookingId}`)
      .set(customer.auth)
      .expect(200);
    expect(booking.body.data).toMatchObject({ status: 'ACCEPTED', estimatedAmount: 2150.6 });
    expect(booking.body.data.history.at(-1)).toMatchObject({
      from: 'PENDING',
      to: 'ACCEPTED',
      actorRole: 'SYSTEM',
    });
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'quotation.accepted' },
    });
    expect(audit).toMatchObject({ actorId: customer.id, entityId: id });
    await respond(id, 'decline').expect(409);
  });

  it('declines, then allows a new quotation', async () => {
    const first = (await draft().expect(201)).body.data.id as string;
    await send(first).expect(200);
    expect((await respond(first, 'decline').expect(200)).body.data.status).toBe('REJECTED');
    const second = (await draft({ labourCost: 900, materialCost: 0 }).expect(201)).body.data
      .id as string;
    await send(second).expect(200);
    const list = await ctx
      .http()
      .get(`/api/v1/providers/me/bookings/${bookingId}/quotations`)
      .set(provider.auth)
      .expect(200);
    expect(list.body.data.map((q: { status: string }) => q.status)).toEqual(['SENT', 'REJECTED']);
  });

  it('expires quotations through the scheduled job and refuses late acceptance', async () => {
    const id = (await draft({ labourCost: 100, materialCost: 0, validForHours: 1 }).expect(201))
      .body.data.id as string;
    await send(id).expect(200);
    await ctx.prisma.quotation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await respond(id, 'accept').expect(422)).body.error.code).toBe('QUOTATION_EXPIRED');
    await ctx.app.get(QuotationExpiryJob).run();
    const stored = await ctx.prisma.quotation.findUniqueOrThrow({ where: { id } });
    expect(stored.status).toBe('EXPIRED');
    expect((await respond(id, 'accept').expect(409)).body.error.code).toBe(
      'QUOTATION_INVALID_STATE',
    );
  });

  it('enforces roles, ownership and booking state', async () => {
    const id = (await draft().expect(201)).body.data.id as string;
    const stranger = await createUser(ctx, 'CUSTOMER');
    await send(id).expect(200);
    await respond(id, 'accept', stranger).expect(404);
    await ctx
      .http()
      .post(`/api/v1/providers/me/quotations/${id}/send`)
      .set(customer.auth)
      .expect(403);
    await draft({ labourCost: -1, materialCost: 0 }).expect(400);
    await ctx.http().get(`/api/v1/bookings/${bookingId}/quotations`).expect(401);

    await respond(id, 'decline').expect(200);
    await providerAction(ctx, provider, bookingId, 'reject', {
      reason: 'Cannot source parts',
    }).expect(200);
    expect((await draft().expect(409)).body.error.code).toBe('BOOKING_NOT_QUOTABLE');
  });
});
