import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from './unit/fixtures/files.js';
import { type TestUser, createUser } from './utils/auth.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import {
  type TestProvider,
  createService,
  registerProvider,
  uploadDocument,
} from './utils/providers.js';

describe('Providers (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let provider: TestProvider;

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
    provider = await registerProvider(ctx);
  });

  const me = (path = '') => `/api/v1/providers/me${path}`;
  const adminPath = (path = '') => `/api/v1/admin/providers${path}`;

  describe('registration & profile', () => {
    it('creates a pending account and profile and signs in', async () => {
      const profile = await ctx.http().get(me()).set(provider.auth).expect(200);
      expect(profile.body.data).toMatchObject({
        verificationStatus: 'PENDING_VERIFICATION',
        businessName: 'Thapa Electricals',
        ratingAverage: 0,
      });
      const user = await ctx.http().get('/api/v1/auth/me').set(provider.auth).expect(200);
      expect(user.body.data).toMatchObject({ role: 'PROVIDER', status: 'PENDING' });

      const patched = await ctx
        .http()
        .patch(me())
        .set(provider.auth)
        .send({ isAvailable: false, serviceRadiusKm: 15 })
        .expect(200);
      expect(patched.body.data).toMatchObject({ isAvailable: false, serviceRadiusKm: 15 });
    });

    it('validates registration input', async () => {
      const res = await ctx
        .http()
        .post('/api/v1/providers/register')
        .send({ fullName: 'X Y', latitude: 51.5, longitude: -0.12 })
        .expect(400);
      const fields = (res.body.error.details as { field: string }[]).map((d) => d.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          'email',
          'phone',
          'password',
          'experienceYears',
          'latitude',
          'longitude',
          'serviceRadiusKm',
        ]),
      );
    });

    it('is only for providers', async () => {
      const customer = await createUser(ctx, 'CUSTOMER');
      await ctx.http().get(me()).set(customer.auth).expect(403);
      await ctx.http().get(me()).expect(401);
    });
  });

  describe('documents', () => {
    it('stores documents privately behind signed URLs', async () => {
      const uploaded = await uploadDocument(ctx, provider).expect(201);
      expect(uploaded.body.data).toMatchObject({
        type: 'CITIZENSHIP',
        status: 'PENDING',
        mimeType: 'application/pdf',
      });

      const url = new URL(uploaded.body.data.url as string);
      const file = await ctx.http().get(`${url.pathname}${url.search}`).expect(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect(file.headers['cache-control']).toBe('private, no-store');

      url.searchParams.set('signature', '0'.repeat(64));
      const tampered = await ctx.http().get(`${url.pathname}${url.search}`).expect(403);
      expect(tampered.body.error.code).toBe('FILE_SIGNATURE_INVALID');
      const key = url.searchParams.get('key') ?? '';
      await ctx
        .http()
        .get(`/api/v1/files/public?key=${encodeURIComponent(key)}`)
        .expect(404);
    });

    it('rejects disguised, missing, oversized and untyped uploads', async () => {
      const disguised = await ctx
        .http()
        .post(me('/documents'))
        .set(provider.auth)
        .field('type', 'CITIZENSHIP')
        .attach('file', SAMPLE_FILES.html, { filename: 'x.png', contentType: 'image/png' })
        .expect(400);
      expect(disguised.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
      const missing = await ctx
        .http()
        .post(me('/documents'))
        .set(provider.auth)
        .field('type', 'CITIZENSHIP')
        .expect(400);
      expect(missing.body.error.code).toBe('FILE_REQUIRED');
      const big = Buffer.concat([SAMPLE_FILES.pdf, Buffer.alloc(5 * 1024 * 1024)]);
      await ctx
        .http()
        .post(me('/documents'))
        .set(provider.auth)
        .field('type', 'CITIZENSHIP')
        .attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' })
        .expect(413);
      await ctx
        .http()
        .post(me('/documents'))
        .set(provider.auth)
        .attach('file', SAMPLE_FILES.pdf, { filename: 'a.pdf', contentType: 'application/pdf' })
        .expect(400);
    });

    it('lets owners delete pending documents only (no IDOR)', async () => {
      const doc = await uploadDocument(ctx, provider).expect(201);
      const other = await registerProvider(ctx);
      await ctx
        .http()
        .delete(me(`/documents/${doc.body.data.id}`))
        .set(other.auth)
        .expect(404);
      await ctx
        .http()
        .delete(me(`/documents/${doc.body.data.id}`))
        .set(provider.auth)
        .expect(204);
    });
  });

  describe('admin verification', () => {
    it('verifies only with documents, activates the account and audits', async () => {
      const noDocs = await ctx
        .http()
        .post(adminPath(`/${provider.providerId}/verify`))
        .set(admin.auth)
        .expect(422);
      expect(noDocs.body.error.code).toBe('PROVIDER_DOCUMENTS_REQUIRED');
      await uploadDocument(ctx, provider).expect(201);

      const pending = await ctx
        .http()
        .get(adminPath('?status=PENDING_VERIFICATION'))
        .set(admin.auth)
        .expect(200);
      expect(pending.body.data[0]).toMatchObject({ phone: provider.phone, documentCount: 1 });
      const detail = await ctx
        .http()
        .get(adminPath(`/${provider.providerId}`))
        .set(admin.auth)
        .expect(200);
      expect(detail.body.data.documents[0].url).toContain('/files/private?');

      const verified = await ctx
        .http()
        .post(adminPath(`/${provider.providerId}/verify`))
        .set(admin.auth)
        .expect(200);
      expect(verified.body.data.verificationStatus).toBe('VERIFIED');
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: provider.id } });
      expect(user.status).toBe('ACTIVE');
      const docs = await ctx
        .http()
        .get(adminPath(`/${provider.providerId}/documents`))
        .set(admin.auth)
        .expect(200);
      expect(docs.body.data[0].status).toBe('APPROVED');
      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'provider.verified' },
      });
      expect(audit).toMatchObject({ actorId: admin.id, entityId: provider.providerId });

      await ctx
        .http()
        .post(adminPath(`/${provider.providerId}/verify`))
        .set(admin.auth)
        .expect(409);
      const suspended = await ctx
        .http()
        .post(adminPath(`/${provider.providerId}/suspend`))
        .set(admin.auth)
        .send({ reason: 'Repeated complaints from customers' })
        .expect(200);
      expect(suspended.body.data.verificationStatus).toBe('SUSPENDED');
      await ctx
        .http()
        .post(adminPath(`/${provider.providerId}/verify`))
        .set(admin.auth)
        .expect(200);
    });

    it('rejects with a reason; the provider re-uploads and resubmits', async () => {
      await uploadDocument(ctx, provider).expect(201);
      await ctx
        .http()
        .post(adminPath(`/${provider.providerId}/reject`))
        .set(admin.auth)
        .send({ reason: 'short' })
        .expect(400);
      const rejected = await ctx
        .http()
        .post(adminPath(`/${provider.providerId}/reject`))
        .set(admin.auth)
        .send({ reason: 'Citizenship photo is unreadable' })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        verificationStatus: 'REJECTED',
        rejectionReason: 'Citizenship photo is unreadable',
      });

      const early = await ctx
        .http()
        .post(me('/verification/resubmit'))
        .set(provider.auth)
        .expect(422);
      expect(early.body.error.code).toBe('PROVIDER_DOCUMENTS_REQUIRED');
      await uploadDocument(ctx, provider, 'NATIONAL_ID').expect(201);
      const again = await ctx
        .http()
        .post(me('/verification/resubmit'))
        .set(provider.auth)
        .expect(200);
      expect(again.body.data).toMatchObject({
        verificationStatus: 'PENDING_VERIFICATION',
        rejectionReason: null,
      });
      await ctx
        .http()
        .post(adminPath(`/${provider.providerId}/suspend`))
        .set(admin.auth)
        .send({ reason: 'Not yet verified anyway' })
        .expect(409);
    });

    it('is admin-only', async () => {
      await ctx.http().get(adminPath()).set(provider.auth).expect(403);
      await ctx
        .http()
        .post(adminPath(`/${provider.providerId}/verify`))
        .set(provider.auth)
        .expect(403);
      await ctx
        .http()
        .get(adminPath('/01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f'))
        .set(admin.auth)
        .expect(404);
    });
  });

  describe('offer, portfolio, schedule, dashboard', () => {
    it('manages offerings with pricing rules', async () => {
      const { serviceId } = await createService(ctx);
      const put = (body: object) =>
        ctx
          .http()
          .put(me(`/services/${serviceId}`))
          .set(provider.auth)
          .send(body);
      expect(
        (await put({ pricingType: 'QUOTATION', price: 100 }).expect(400)).body.error.code,
      ).toBe('INVALID_PRICING');
      await put({ pricingType: 'QUOTATION' }).expect(200);
      const fixed = await put({ pricingType: 'FIXED', price: 1200.5 }).expect(200);
      expect(fixed.body.data).toMatchObject({
        pricingType: 'FIXED',
        price: 1200.5,
        serviceName: 'Fan Installation',
      });
      expect(
        (await ctx.http().get(me('/services')).set(provider.auth).expect(200)).body.data,
      ).toHaveLength(1);
      await ctx.prisma.service.update({ where: { id: serviceId }, data: { isActive: false } });
      expect((await put({ pricingType: 'FIXED', price: 10 }).expect(422)).body.error.code).toBe(
        'SERVICE_NOT_OFFERABLE',
      );
      await ctx
        .http()
        .delete(me(`/services/${serviceId}`))
        .set(provider.auth)
        .expect(204);
      await ctx
        .http()
        .delete(me(`/services/${serviceId}`))
        .set(provider.auth)
        .expect(404);
    });

    it('uploads public portfolio images', async () => {
      const res = await ctx
        .http()
        .post(me('/portfolio'))
        .set(provider.auth)
        .field('caption', 'Kitchen wiring')
        .attach('file', SAMPLE_FILES.png, { filename: 'work.png', contentType: 'image/png' })
        .expect(201);
      const url = new URL(res.body.data.url as string);
      const image = await ctx.http().get(`${url.pathname}${url.search}`).expect(200);
      expect(image.headers['content-type']).toBe('image/png');
      await ctx
        .http()
        .post(me('/portfolio'))
        .set(provider.auth)
        .attach('file', SAMPLE_FILES.pdf, { filename: 'a.pdf', contentType: 'application/pdf' })
        .expect(400);
      await ctx
        .http()
        .delete(me(`/portfolio/${res.body.data.id}`))
        .set(provider.auth)
        .expect(204);
    });

    it('manages windows, blocked dates and settings', async () => {
      const nextYearDate = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
      const windows = [
        { dayOfWeek: 0, startMinute: 540, endMinute: 720 },
        { dayOfWeek: 0, startMinute: 780, endMinute: 1080 },
      ];
      await ctx
        .http()
        .put(me('/availability/windows'))
        .set(provider.auth)
        .send({ windows })
        .expect(200);
      const overlap = await ctx
        .http()
        .put(me('/availability/windows'))
        .set(provider.auth)
        .send({ windows: [...windows, { dayOfWeek: 0, startMinute: 700, endMinute: 800 }] })
        .expect(400);
      expect(overlap.body.error.code).toBe('AVAILABILITY_OVERLAP');
      await ctx
        .http()
        .put(me('/availability/windows'))
        .set(provider.auth)
        .send({ windows: [{ dayOfWeek: 7, startMinute: 0, endMinute: 10 }] })
        .expect(400);

      const blocked = await ctx
        .http()
        .post(me('/availability/blocked-dates'))
        .set(provider.auth)
        .send({ date: nextYearDate, reason: 'Dashain' })
        .expect(201);
      await ctx
        .http()
        .post(me('/availability/blocked-dates'))
        .set(provider.auth)
        .send({ date: nextYearDate })
        .expect(409);
      await ctx
        .http()
        .post(me('/availability/blocked-dates'))
        .set(provider.auth)
        .send({ date: '2000-01-01' })
        .expect(422);
      await ctx
        .http()
        .patch(me('/settings'))
        .set(provider.auth)
        .send({ slotMinutes: 90, maxDailyBookings: 3 })
        .expect(200);
      await ctx
        .http()
        .patch(me('/settings'))
        .set(provider.auth)
        .send({ slotMinutes: 5 })
        .expect(400);

      const view = await ctx.http().get(me('/availability')).set(provider.auth).expect(200);
      expect(view.body.data).toMatchObject({
        windows,
        blockedDates: [{ date: nextYearDate, reason: 'Dashain' }],
        settings: { slotMinutes: 90, maxDailyBookings: 3 },
      });
      await ctx
        .http()
        .delete(me(`/availability/blocked-dates/${blocked.body.data.id}`))
        .set(provider.auth)
        .expect(204);
    });

    it('returns dashboard counts and an earnings summary', async () => {
      const dashboard = await ctx.http().get(me('/dashboard')).set(provider.auth).expect(200);
      expect(dashboard.body.data.bookings).toEqual({
        pending: 0,
        accepted: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        disputed: 0,
        scheduledToday: 0,
      });
      const earnings = await ctx.http().get(me('/earnings-summary')).set(provider.auth).expect(200);
      expect(earnings.body.data).toEqual({
        allTime: { completedJobs: 0, totalAmount: 0 },
        thisMonth: { completedJobs: 0, totalAmount: 0 },
      });
    });
  });
});
