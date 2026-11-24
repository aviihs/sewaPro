import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from './unit/fixtures/files.js';
import { TEST_PASSWORD, createUser } from './utils/auth.js';
import { BALUWATAR, nepalSlot } from './utils/bookings.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';

/**
 * The whole marketplace journey through public HTTP only. Provider discovery
 * uses the catalog and the provider id until Step 6 (PostGIS search) lands.
 */
describe('Full flow (e2e): onboarding → verification → booking → quotation → job → review → notifications', () => {
  let ctx: TestContext;
  const api = (path: string) => `/api/v1${path}`;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
    await rm('.tmp/storage-test', { recursive: true, force: true });
  });

  it('completes the journey', async () => {
    const http = () => ctx.http();
    const admin = await createUser(ctx, 'ADMIN');
    const category = await http()
      .post(api('/admin/categories'))
      .set(admin.auth)
      .send({ name: 'Electrician' })
      .expect(201);
    const service = await http()
      .post(api('/admin/services'))
      .set(admin.auth)
      .send({ categoryId: category.body.data.id, name: 'MCB and DB Repair' })
      .expect(201);
    const serviceId = service.body.data.id as string;

    const customerReg = await http()
      .post(api('/auth/register'))
      .send({
        fullName: 'Aarati Sharma',
        email: 'aarati@flow.test',
        phone: '9841000101',
        password: TEST_PASSWORD,
      })
      .expect(201);
    const customer = { Authorization: `Bearer ${customerReg.body.data.accessToken as string}` };
    const providerReg = await http()
      .post(api('/providers/register'))
      .send({
        fullName: 'Ram Thapa',
        email: 'ram@flow.test',
        phone: '9801000102',
        password: TEST_PASSWORD,
        businessName: 'Thapa Electricals',
        experienceYears: 9,
        latitude: 27.7172,
        longitude: 85.324,
        serviceRadiusKm: 12,
      })
      .expect(201);
    const provider = { Authorization: `Bearer ${providerReg.body.data.accessToken as string}` };

    await http()
      .post(api('/providers/me/documents'))
      .set(provider)
      .field('type', 'CITIZENSHIP')
      .attach('file', SAMPLE_FILES.pdf, { filename: 'id.pdf', contentType: 'application/pdf' })
      .expect(201);
    await http()
      .post(api('/providers/me/portfolio'))
      .set(provider)
      .attach('file', SAMPLE_FILES.jpeg, { filename: 'work.jpg', contentType: 'image/jpeg' })
      .expect(201);
    await http()
      .put(api(`/providers/me/services/${serviceId}`))
      .set(provider)
      .send({ pricingType: 'QUOTATION' })
      .expect(200);
    const windows = [0, 1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startMinute: 480,
      endMinute: 1140,
    }));
    await http()
      .put(api('/providers/me/availability/windows'))
      .set(provider)
      .send({ windows })
      .expect(200);
    const me = await http().get(api('/providers/me')).set(provider).expect(200);
    const providerId = me.body.data.id as string;

    const queue = await http()
      .get(api('/admin/providers?status=PENDING_VERIFICATION'))
      .set(admin.auth)
      .expect(200);
    expect(queue.body.data.map((p: { provider: { id: string } }) => p.provider.id)).toEqual([
      providerId,
    ]);
    await http()
      .post(api(`/admin/providers/${providerId}/verify`))
      .set(admin.auth)
      .expect(200);

    const catalog = await http().get(api('/categories')).expect(200);
    expect(catalog.body.data[0].services[0].id).toBe(serviceId);
    await http()
      .get(api(`/providers/${providerId}/reviews`))
      .expect(200);

    const address = await http().post(api('/addresses')).set(customer).send(BALUWATAR).expect(201);
    const booking = await http()
      .post(api('/bookings'))
      .set(customer)
      .set('Idempotency-Key', 'flow-booking-0001')
      .send({
        providerId,
        serviceId,
        addressId: address.body.data.id,
        scheduledAt: nepalSlot(3, 11),
        problemDescription: 'MCB trips every evening',
      })
      .expect(201);
    const bookingId = booking.body.data.id as string;
    expect(booking.body.data).toMatchObject({
      status: 'PENDING',
      pricingType: 'QUOTATION',
      quotedPrice: null,
    });

    const job = await http()
      .get(api(`/providers/me/bookings/${bookingId}`))
      .set(provider)
      .expect(200);
    expect(job.body.data.customer.phone).toBeNull();
    const quote = await http()
      .post(api(`/providers/me/bookings/${bookingId}/quotations`))
      .set(provider)
      .send({ labourCost: 1800, materialCost: 950.5, note: 'Replace MCB' })
      .expect(201);
    const quotationId = quote.body.data.id as string;
    await http()
      .post(api(`/providers/me/quotations/${quotationId}/send`))
      .set(provider)
      .expect(200);
    await http()
      .post(api(`/bookings/${bookingId}/quotations/${quotationId}/accept`))
      .set(customer)
      .expect(200);

    const confirmed = await http()
      .get(api(`/providers/me/bookings/${bookingId}`))
      .set(provider)
      .expect(200);
    expect(confirmed.body.data).toMatchObject({
      status: 'ACCEPTED',
      estimatedAmount: 2750.5,
      customer: { phone: '+9779841000101' },
    });
    for (const action of ['on-the-way', 'start'])
      await http()
        .post(api(`/providers/me/bookings/${bookingId}/${action}`))
        .set(provider)
        .expect(200);
    await http()
      .post(api(`/providers/me/bookings/${bookingId}/complete`))
      .set(provider)
      .send({ finalAmount: 2750.5 })
      .expect(200);

    await http()
      .post(api(`/bookings/${bookingId}/review`))
      .set(customer)
      .send({
        overall: 5,
        serviceQuality: 5,
        professionalism: 5,
        punctuality: 4,
        communication: 5,
        comment: 'Solved it quickly.',
      })
      .expect(201);
    const reviews = await http()
      .get(api(`/providers/${providerId}/reviews`))
      .expect(200);
    expect(reviews.body.data[0]).toMatchObject({ customerName: 'Aarati S.', overall: 5 });

    const notificationTypes = async (auth: Record<string, string>) =>
      (
        (await http().get(api('/notifications?limit=50')).set(auth).expect(200)).body.data as {
          type: string;
        }[]
      )
        .map((n) => n.type)
        .sort();
    expect(await notificationTypes(customer)).toEqual([
      'BOOKING_ACCEPTED',
      'BOOKING_COMPLETED',
      'BOOKING_STATUS_CHANGED',
      'BOOKING_STATUS_CHANGED',
      'QUOTATION_SENT',
    ]);
    expect(await notificationTypes(provider)).toEqual([
      'BOOKING_CREATED',
      'PROVIDER_VERIFIED',
      'QUOTATION_RESPONDED',
      'REVIEW_RECEIVED',
    ]);

    const dashboard = await http().get(api('/providers/me/dashboard')).set(provider).expect(200);
    expect(dashboard.body.data).toMatchObject({
      verificationStatus: 'VERIFIED',
      ratingAverage: 5,
      ratingCount: 1,
      bookings: { completed: 1 },
    });
    const earnings = await http()
      .get(api('/providers/me/earnings-summary'))
      .set(provider)
      .expect(200);
    expect(earnings.body.data.allTime).toEqual({ completedJobs: 1, totalAmount: 2750.5 });
    const adminView = await http().get(api('/admin/dashboard')).set(admin.auth).expect(200);
    expect(adminView.body.data.totals).toMatchObject({
      customers: 1,
      providers: 1,
      verifiedProviders: 1,
      bookingsByStatus: { COMPLETED: 1 },
    });
    const audit = await http().get(api('/admin/audit-logs?limit=100')).set(admin.auth).expect(200);
    expect(audit.body.data.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining([
        'category.created',
        'service.created',
        'provider.verified',
        'quotation.accepted',
        'booking.completed',
      ]),
    );
  });
});
