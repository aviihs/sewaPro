import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from './unit/fixtures/files.js';
import { TEST_PASSWORD, type TestUser, createUser } from './utils/auth.js';
import { book, createAddress, nepalSlot } from './utils/bookings.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { completedBooking } from './utils/lifecycle.js';
import { registerProvider, uploadDocument, verifiedProvider } from './utils/providers.js';

type Method = 'get' | 'post' | 'patch' | 'delete' | 'put';
type Row = readonly [label: string, method: Method, path: string, body?: object];

describe('Security (e2e)', () => {
  let ctx: TestContext;
  let customerB: TestUser;
  let providerB: TestUser;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    const admin = await createUser(ctx, 'ADMIN');
    const customerA = await createUser(ctx, 'CUSTOMER');
    const providerA = await verifiedProvider(ctx, admin);
    customerB = await createUser(ctx, 'CUSTOMER');
    providerB = await registerProvider(ctx);

    ids.address = await createAddress(ctx, customerA);
    const pending = await book(ctx, customerA, {
      providerId: providerA.providerId,
      serviceId: providerA.serviceId,
      addressId: ids.address,
      scheduledAt: nepalSlot(2, 9),
    }).expect(201);
    ids.booking = pending.body.data.id as string;
    const quote = await ctx
      .http()
      .post(`/api/v1/providers/me/bookings/${ids.booking}/quotations`)
      .set(providerA.auth)
      .send({ labourCost: 100, materialCost: 0 })
      .expect(201);
    ids.quotation = quote.body.data.id as string;
    await ctx
      .http()
      .post(`/api/v1/providers/me/quotations/${ids.quotation}/send`)
      .set(providerA.auth)
      .expect(200);
    ids.completed = await completedBooking(ctx, customerA, providerA, 3);
    const dispute = await ctx
      .http()
      .post('/api/v1/disputes')
      .set(customerA.auth)
      .send({
        bookingId: ids.completed,
        reason: 'Unfinished work',
        description: 'Only half of the job was done.',
      })
      .expect(201);
    ids.dispute = dispute.body.data.id as string;
    ids.document = (await uploadDocument(ctx, providerA).expect(201)).body.data.id as string;
    const image = await ctx
      .http()
      .post('/api/v1/providers/me/portfolio')
      .set(providerA.auth)
      .attach('file', SAMPLE_FILES.png, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    ids.image = image.body.data.id as string;
    const blocked = await ctx
      .http()
      .post('/api/v1/providers/me/availability/blocked-dates')
      .set(providerA.auth)
      .send({ date: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10) })
      .expect(201);
    ids.blocked = blocked.body.data.id as string;
    const notes = await ctx.http().get('/api/v1/notifications').set(providerA.auth).expect(200);
    ids.notification = notes.body.data[0].id as string;
  });

  afterAll(async () => {
    await ctx.app.close();
    await rm('.tmp/storage-test', { recursive: true, force: true });
  });

  describe('IDOR matrix: a user of the same role never reaches another user’s resources (404)', () => {
    const customerRoutes = (): Row[] => [
      ['address read', 'get', `/addresses/${ids.address}`],
      ['address update', 'patch', `/addresses/${ids.address}`, { label: 'Mine now' }],
      ['address delete', 'delete', `/addresses/${ids.address}`],
      ['booking read', 'get', `/bookings/${ids.booking}`],
      ['booking cancel', 'post', `/bookings/${ids.booking}/cancel`, {}],
      ['quotations list', 'get', `/bookings/${ids.booking}/quotations`],
      ['quotation accept', 'post', `/bookings/${ids.booking}/quotations/${ids.quotation}/accept`],
      ['quotation decline', 'post', `/bookings/${ids.booking}/quotations/${ids.quotation}/decline`],
      [
        'review create',
        'post',
        `/bookings/${ids.completed}/review`,
        { overall: 1, serviceQuality: 1, professionalism: 1, punctuality: 1, communication: 1 },
      ],
      ['dispute read', 'get', `/disputes/${ids.dispute}`],
      [
        'dispute raise',
        'post',
        '/disputes',
        {
          bookingId: ids.booking,
          reason: 'Not mine',
          description: 'Trying to dispute another booking.',
        },
      ],
      ['notification read', 'post', `/notifications/${ids.notification}/read`],
    ];
    const providerRoutes = (): Row[] => [
      ['job read', 'get', `/providers/me/bookings/${ids.booking}`],
      ...['accept', 'on-the-way', 'start'].map((a): Row => [
        `job ${a}`,
        'post',
        `/providers/me/bookings/${ids.booking}/${a}`,
      ]),
      [
        'job reject',
        'post',
        `/providers/me/bookings/${ids.booking}/reject`,
        { reason: 'Not my job' },
      ],
      [
        'job complete',
        'post',
        `/providers/me/bookings/${ids.booking}/complete`,
        { finalAmount: 1 },
      ],
      [
        'quotation create',
        'post',
        `/providers/me/bookings/${ids.booking}/quotations`,
        { labourCost: 1, materialCost: 1 },
      ],
      ['quotations list', 'get', `/providers/me/bookings/${ids.booking}/quotations`],
      ['quotation send', 'post', `/providers/me/quotations/${ids.quotation}/send`],
      ['document delete', 'delete', `/providers/me/documents/${ids.document}`],
      ['portfolio delete', 'delete', `/providers/me/portfolio/${ids.image}`],
      ['blocked date delete', 'delete', `/providers/me/availability/blocked-dates/${ids.blocked}`],
    ];
    const call = (user: TestUser, [, method, path, body]: Row) => {
      const req = ctx.http()[method](`/api/v1${path}`).set(user.auth);
      return body ? req.send(body) : req;
    };

    it('customer B gets 404 on every customer A resource', async () => {
      for (const row of customerRoutes()) {
        const res = await call(customerB, row);
        expect(`${row[0]}: ${res.status}`).toBe(`${row[0]}: 404`);
      }
    });

    it('provider B gets 404 on every provider A resource', async () => {
      for (const row of providerRoutes()) {
        const res = await call(providerB, row);
        expect(`${row[0]}: ${res.status}`).toBe(`${row[0]}: 404`);
      }
    });

    it('the wrong role gets 403 and anonymous callers 401', async () => {
      for (const row of [
        ...customerRoutes().filter(
          ([l]) => !l.startsWith('notification') && !l.startsWith('dispute'),
        ),
        ...providerRoutes(),
      ]) {
        const user = row[2].startsWith('/providers') ? customerB : providerB;
        expect(`${row[0]}: ${(await call(user, row)).status}`).toBe(`${row[0]}: 403`);
        expect(`${row[0]}: ${(await ctx.http()[row[1]](`/api/v1${row[2]}`)).status}`).toBe(
          `${row[0]}: 401`,
        );
      }
    });
  });

  describe('mass assignment', () => {
    it('rejects privileged or server-owned fields everywhere', async () => {
      const probes: [Method, string, TestUser | null, object][] = [
        [
          'post',
          '/auth/register',
          null,
          {
            fullName: 'X Y',
            email: 'x@y.com',
            phone: '9841000001',
            password: TEST_PASSWORD,
            role: 'ADMIN',
          },
        ],
        ['patch', '/users/me', customerB, { status: 'ACTIVE' }],
        ['patch', '/providers/me', providerB, { verificationStatus: 'VERIFIED', ratingAverage: 5 }],
        [
          'post',
          '/bookings',
          customerB,
          {
            providerId: ids.booking,
            serviceId: ids.booking,
            addressId: ids.address,
            scheduledAt: nepalSlot(2, 9),
            status: 'COMPLETED',
            finalAmount: 0,
          },
        ],
        [
          'post',
          `/providers/me/bookings/${ids.booking}/quotations`,
          providerB,
          { labourCost: 1, materialCost: 1, total: 0 },
        ],
      ];
      for (const [method, path, user, body] of probes) {
        const req = ctx.http()[method](`/api/v1${path}`);
        const res = await (user ? req.set(user.auth) : req).send(body).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    });
  });

  describe('rate limiting', () => {
    it('limits sensitive auth routes per IP', async () => {
      const limited = await createTestApp({ sensitiveThrottleLimit: 3 });
      try {
        const attempt = () =>
          limited
            .http()
            .post('/api/v1/auth/login')
            .send({ email: 'nobody@x.com', password: 'Wrong12345' });
        for (let i = 0; i < 3; i += 1) await attempt().expect(401);
        const blocked = await attempt().expect(429);
        expect(blocked.body.error.code).toBe('RATE_LIMITED');
        expect(blocked.headers['retry-after-sensitive']).toBeDefined();
        await limited.http().get('/api/v1/categories').expect(200);
      } finally {
        await limited.app.close();
      }
    });
  });
});
