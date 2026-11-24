import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, type TestUser, createUser } from './utils/auth.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { completedBooking } from './utils/lifecycle.js';
import { registerProvider, verifiedProvider } from './utils/providers.js';

const nepalToday = (): string => new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);

describe('Admin APIs (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;

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
  });

  it('reports dashboard totals, growth, activity and booking reports', async () => {
    const provider = await verifiedProvider(ctx, admin);
    await registerProvider(ctx);
    const customer = await createUser(ctx, 'CUSTOMER');
    await completedBooking(ctx, customer, provider, 2, 2500);

    const dashboard = await ctx.http().get('/api/v1/admin/dashboard').set(admin.auth).expect(200);
    expect(dashboard.body.data.totals).toEqual({
      customers: 1,
      providers: 2,
      verifiedProviders: 1,
      pendingVerification: 1,
      suspendedUsers: 0,
      bookingsByStatus: { COMPLETED: 1 },
      openDisputes: 0,
    });
    expect(dashboard.body.data.monthlyGrowth).toHaveLength(6);
    expect(dashboard.body.data.monthlyGrowth.at(-1)).toMatchObject({
      newCustomers: 1,
      newProviders: 2,
      newBookings: 1,
    });
    expect(dashboard.body.data.recentActivity[0]).toMatchObject({
      action: 'booking.completed',
      entityType: 'Booking',
    });

    const today = nepalToday();
    const report = await ctx
      .http()
      .get(`/api/v1/admin/reports/bookings?from=${today}&to=${today}`)
      .set(admin.auth)
      .expect(200);
    expect(report.body.data).toEqual([
      { period: today, created: 1, completed: 1, cancelled: 0, completedAmount: 2500 },
    ]);
    const growth = await ctx
      .http()
      .get(`/api/v1/admin/reports/growth?from=${today.slice(0, 8)}01&to=${today}&groupBy=month`)
      .set(admin.auth)
      .expect(200);
    expect(growth.body.data).toEqual([
      { period: today.slice(0, 7), newCustomers: 1, newProviders: 2, newBookings: 1 },
    ]);

    const invalid = await ctx
      .http()
      .get('/api/v1/admin/reports/bookings?from=2030-02-30&to=2030-03-01')
      .set(admin.auth)
      .expect(400);
    expect(invalid.body.error.code).toBe('INVALID_REPORT_RANGE');
    await ctx
      .http()
      .get('/api/v1/admin/reports/bookings?from=2020-01-01&to=2030-01-01')
      .set(admin.auth)
      .expect(400);
    await ctx
      .http()
      .get('/api/v1/admin/reports/bookings?from=today&to=2030-01-01')
      .set(admin.auth)
      .expect(400);
  });

  it('suspends a user immediately and reactivates them', async () => {
    const customer = await createUser(ctx, 'CUSTOMER', { fullName: 'Hari Bahadur' });
    await ctx.http().get('/api/v1/auth/me').set(customer.auth).expect(200);

    const list = await ctx
      .http()
      .get('/api/v1/admin/users?role=CUSTOMER&q=hari')
      .set(admin.auth)
      .expect(200);
    expect(list.body.data.map((u: { id: string }) => u.id)).toEqual([customer.id]);
    await ctx
      .http()
      .post(`/api/v1/admin/users/${customer.id}/suspend`)
      .set(admin.auth)
      .send({ reason: 'x' })
      .expect(400);
    const suspended = await ctx
      .http()
      .post(`/api/v1/admin/users/${customer.id}/suspend`)
      .set(admin.auth)
      .send({ reason: 'Repeated fake bookings' })
      .expect(200);
    expect(suspended.body.data.status).toBe('SUSPENDED');

    expect(
      (await ctx.http().get('/api/v1/auth/me').set(customer.auth).expect(403)).body.error.code,
    ).toBe('ACCOUNT_SUSPENDED');
    await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: customer.refreshToken })
      .expect(401);
    await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: customer.email, password: TEST_PASSWORD })
      .expect(403);
    await ctx
      .http()
      .post(`/api/v1/admin/users/${customer.id}/suspend`)
      .set(admin.auth)
      .send({ reason: 'Again please' })
      .expect(409);
    const self = await ctx
      .http()
      .post(`/api/v1/admin/users/${admin.id}/suspend`)
      .set(admin.auth)
      .send({ reason: 'Oops myself' })
      .expect(422);
    expect(self.body.error.code).toBe('CANNOT_CHANGE_OWN_STATUS');

    const back = await ctx
      .http()
      .post(`/api/v1/admin/users/${customer.id}/reactivate`)
      .set(admin.auth)
      .send({ reason: 'Appeal accepted' })
      .expect(200);
    expect(back.body.data.status).toBe('ACTIVE');
    await ctx
      .http()
      .post('/api/v1/auth/login')
      .send({ email: customer.email, password: TEST_PASSWORD })
      .expect(200);
    expect(await ctx.prisma.auditLog.count({ where: { entityId: customer.id } })).toBe(2);

    const pending = await registerProvider(ctx);
    await ctx
      .http()
      .post(`/api/v1/admin/users/${pending.id}/suspend`)
      .set(admin.auth)
      .send({ reason: 'Fake documents' })
      .expect(200);
    const restored = await ctx
      .http()
      .post(`/api/v1/admin/users/${pending.id}/reactivate`)
      .set(admin.auth)
      .send({ reason: 'Clarified' })
      .expect(200);
    expect(restored.body.data.status).toBe('PENDING');
  });

  it('monitors bookings with full detail', async () => {
    const provider = await verifiedProvider(ctx, admin);
    const customer = await createUser(ctx, 'CUSTOMER');
    const id = await completedBooking(ctx, customer, provider);
    const list = await ctx
      .http()
      .get('/api/v1/admin/bookings?status=COMPLETED')
      .set(admin.auth)
      .expect(200);
    expect(list.body.meta.totalItems).toBe(1);
    const detail = await ctx.http().get(`/api/v1/admin/bookings/${id}`).set(admin.auth).expect(200);
    expect(detail.body.data).toMatchObject({
      customer: { phone: customer.phone },
      provider: { phone: provider.phone },
    });
    await ctx
      .http()
      .get('/api/v1/admin/bookings/01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f')
      .set(admin.auth)
      .expect(404);
  });

  it('is admin-only', async () => {
    const customer = await createUser(ctx, 'CUSTOMER');
    for (const path of [
      'dashboard',
      'users',
      'bookings',
      'reports/bookings?from=2030-01-01&to=2030-01-02',
    ]) {
      await ctx.http().get(`/api/v1/admin/${path}`).set(customer.auth).expect(403);
      await ctx.http().get(`/api/v1/admin/${path}`).expect(401);
    }
  });
});
