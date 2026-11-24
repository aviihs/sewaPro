import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestUser, createUser } from './utils/auth.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';

const home = {
  label: 'Home',
  line1: 'House 12, Ward 4',
  area: 'Baluwatar',
  city: 'Kathmandu',
  latitude: 27.7215,
  longitude: 85.3304,
};

describe('Users & Addresses (e2e)', () => {
  let ctx: TestContext;
  let customer: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    customer = await createUser(ctx, 'CUSTOMER');
  });

  describe('/users/me', () => {
    it('reads and updates the profile', async () => {
      const res = await ctx
        .http()
        .patch('/api/v1/users/me')
        .set(customer.auth)
        .send({ fullName: '  Aarati S  ', email: 'NEW@Example.com' })
        .expect(200);
      expect(res.body.data).toMatchObject({ fullName: 'Aarati S', email: 'new@example.com' });
      const me = await ctx.http().get('/api/v1/users/me').set(customer.auth).expect(200);
      expect(me.body.data.fullName).toBe('Aarati S');
    });

    it('rejects an email used by someone else, and role/phone changes', async () => {
      const other = await createUser(ctx, 'CUSTOMER');
      const conflict = await ctx
        .http()
        .patch('/api/v1/users/me')
        .set(customer.auth)
        .send({ email: other.email })
        .expect(409);
      expect(conflict.body.error.code).toBe('EMAIL_ALREADY_IN_USE');
      await ctx
        .http()
        .patch('/api/v1/users/me')
        .set(customer.auth)
        .send({ role: 'ADMIN', phone: '9841111111' })
        .expect(400);
    });

    it('requires authentication', async () => {
      await ctx.http().get('/api/v1/users/me').expect(401);
    });
  });

  describe('/addresses', () => {
    const create = (user: TestUser, body: object) =>
      ctx.http().post('/api/v1/addresses').set(user.auth).send(body);

    it('creates, lists, updates and deletes with a single default', async () => {
      const first = await create(customer, home).expect(201);
      expect(first.body.data).toMatchObject({ ...home, isDefault: true, district: null });
      const second = await create(customer, { ...home, label: 'Office', isDefault: true }).expect(
        201,
      );

      const list = await ctx.http().get('/api/v1/addresses').set(customer.auth).expect(200);
      expect(list.body.data.map((a: { label: string }) => a.label)).toEqual(['Office', 'Home']);
      expect(list.body.data.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);

      await ctx
        .http()
        .patch(`/api/v1/addresses/${first.body.data.id}`)
        .set(customer.auth)
        .send({ isDefault: true, landmark: 'Near the temple' })
        .expect(200);
      const unset = await ctx
        .http()
        .patch(`/api/v1/addresses/${first.body.data.id}`)
        .set(customer.auth)
        .send({ isDefault: false })
        .expect(422);
      expect(unset.body.error.code).toBe('DEFAULT_ADDRESS_REQUIRED');

      await ctx
        .http()
        .delete(`/api/v1/addresses/${first.body.data.id}`)
        .set(customer.auth)
        .expect(204);
      const remaining = await ctx
        .http()
        .get(`/api/v1/addresses/${second.body.data.id}`)
        .set(customer.auth)
        .expect(200);
      expect(remaining.body.data.isDefault).toBe(true);
    });

    it('hides other customers addresses (no IDOR)', async () => {
      const mine = await create(customer, home).expect(201);
      const intruder = await createUser(ctx, 'CUSTOMER');
      const path = `/api/v1/addresses/${mine.body.data.id}`;
      await ctx.http().get(path).set(intruder.auth).expect(404);
      await ctx.http().patch(path).set(intruder.auth).send({ label: 'Mine' }).expect(404);
      await ctx.http().delete(path).set(intruder.auth).expect(404);
    });

    it('validates coordinates, ids and roles', async () => {
      const res = await create(customer, { ...home, latitude: 40.7, longitude: -74 }).expect(400);
      expect((res.body.error.details as { field: string }[]).map((d) => d.field)).toEqual([
        'latitude',
        'longitude',
      ]);
      await ctx.http().get('/api/v1/addresses/not-a-uuid').set(customer.auth).expect(400);

      const provider = await createUser(ctx, 'PROVIDER');
      const forbidden = await ctx.http().get('/api/v1/addresses').set(provider.auth).expect(403);
      expect(forbidden.body.error.code).toBe('FORBIDDEN_ROLE');
      await ctx.http().get('/api/v1/addresses').expect(401);
    });

    it('limits customers to 10 addresses', async () => {
      for (let i = 0; i < 10; i += 1)
        await create(customer, { ...home, label: `A${i}` }).expect(201);
      const res = await create(customer, home).expect(422);
      expect(res.body.error.code).toBe('ADDRESS_LIMIT_REACHED');
    });
  });
});
