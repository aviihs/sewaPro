import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestUser, createUser } from './utils/auth.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';

describe('Catalog (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;

  const adminPost = (path: string, body: object) =>
    ctx.http().post(`/api/v1/admin/${path}`).set(admin.auth).send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = await createUser(ctx, 'ADMIN');
  });

  it('admin creates categories and services; the public catalog reflects changes immediately', async () => {
    const before = await ctx.http().get('/api/v1/categories').expect(200);
    expect(before.body.data).toEqual([]);

    const cat = await adminPost('categories', { name: 'AC Technician', sortOrder: 2 }).expect(201);
    expect(cat.body.data).toMatchObject({
      name: 'AC Technician',
      slug: 'ac-technician',
      isActive: true,
    });
    const hidden = await adminPost('categories', { name: 'Hidden', isActive: false }).expect(201);
    const svc = await adminPost('services', {
      categoryId: cat.body.data.id,
      name: 'AC Gas Refill & Check',
    }).expect(201);
    expect(svc.body.data.slug).toBe('ac-gas-refill-and-check');

    const categories = await ctx.http().get('/api/v1/categories').expect(200);
    expect(categories.body.data).toEqual([
      expect.objectContaining({
        id: cat.body.data.id,
        services: [
          expect.objectContaining({ id: svc.body.data.id, name: 'AC Gas Refill & Check' }),
        ],
      }),
    ]);
    expect(JSON.stringify(categories.body)).not.toContain(hidden.body.data.id);

    const services = await ctx
      .http()
      .get(`/api/v1/services?categoryId=${cat.body.data.id}&q=gas`)
      .expect(200);
    expect(services.body.data).toHaveLength(1);

    await ctx
      .http()
      .patch(`/api/v1/admin/categories/${hidden.body.data.id}`)
      .set(admin.auth)
      .send({ isActive: true })
      .expect(200);
    const after = await ctx.http().get('/api/v1/categories').expect(200);
    expect(after.body.data).toHaveLength(2);
  });

  it('reports conflicts and validation errors', async () => {
    const cat = await adminPost('categories', { name: 'Plumber' }).expect(201);
    expect((await adminPost('categories', { name: 'plumber' }).expect(409)).body.error.code).toBe(
      'CATEGORY_NAME_TAKEN',
    );
    expect(
      (await adminPost('categories', { name: 'Pipes', slug: 'plumber' }).expect(409)).body.error
        .code,
    ).toBe('SLUG_TAKEN');
    await adminPost('categories', { name: 'X', slug: 'Bad Slug!' }).expect(400);
    await adminPost('categories', {
      name: 'Icons',
      iconUrl: 'http://insecure.example/i.png',
    }).expect(400);

    await adminPost('services', { categoryId: cat.body.data.id, name: 'Leak Repair' }).expect(201);
    expect(
      (
        await adminPost('services', { categoryId: cat.body.data.id, name: 'Leak Repair' }).expect(
          409,
        )
      ).body.error.code,
    ).toBe('SERVICE_NAME_TAKEN');
    const missing = await adminPost('services', {
      categoryId: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
      name: 'X1',
    }).expect(404);
    expect(missing.body.error.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('paginates admin lists and filters inactive entries', async () => {
    for (const name of ['A1', 'A2', 'A3']) await adminPost('categories', { name }).expect(201);
    await adminPost('categories', { name: 'Off', isActive: false }).expect(201);
    const page = await ctx
      .http()
      .get('/api/v1/admin/categories?limit=2&page=2')
      .set(admin.auth)
      .expect(200);
    expect(page.body.meta).toMatchObject({ page: 2, limit: 2, totalItems: 4, totalPages: 2 });
    const inactive = await ctx
      .http()
      .get('/api/v1/admin/categories?isActive=false')
      .set(admin.auth)
      .expect(200);
    expect(inactive.body.data.map((c: { name: string }) => c.name)).toEqual(['Off']);
  });

  it('deactivates entries still offered by providers and soft-deletes unused ones, with audit', async () => {
    const cat = await adminPost('categories', { name: 'Electrician' }).expect(201);
    const used = await adminPost('services', {
      categoryId: cat.body.data.id,
      name: 'Wiring',
    }).expect(201);
    const unused = await adminPost('services', {
      categoryId: cat.body.data.id,
      name: 'Fan Fitting',
    }).expect(201);
    const providerUser = await createUser(ctx, 'PROVIDER');
    const provider = await ctx.prisma.provider.create({
      data: { userId: providerUser.id, latitude: 27.7, longitude: 85.3 },
    });
    await ctx.prisma.providerService.create({
      data: {
        providerId: provider.id,
        serviceId: used.body.data.id,
        pricingType: 'FIXED',
        price: 500,
      },
    });

    const svcRemoval = await ctx
      .http()
      .delete(`/api/v1/admin/services/${unused.body.data.id}`)
      .set(admin.auth)
      .expect(200);
    expect(svcRemoval.body.data).toEqual({ id: unused.body.data.id, outcome: 'DELETED' });
    await ctx
      .http()
      .get(`/api/v1/admin/services/${unused.body.data.id}`)
      .set(admin.auth)
      .expect(404);

    const catRemoval = await ctx
      .http()
      .delete(`/api/v1/admin/categories/${cat.body.data.id}`)
      .set(admin.auth)
      .expect(200);
    expect(catRemoval.body.data.outcome).toBe('DEACTIVATED');
    const stillThere = await ctx
      .http()
      .get(`/api/v1/admin/categories/${cat.body.data.id}`)
      .set(admin.auth)
      .expect(200);
    expect(stillThere.body.data.isActive).toBe(false);
    expect((await ctx.http().get('/api/v1/categories').expect(200)).body.data).toEqual([]);

    const logs = await ctx.prisma.auditLog.findMany({
      where: { actorId: admin.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'category.created',
      'service.created',
      'service.created',
      'service.deleted',
      'category.deactivated',
    ]);
    expect(logs[0]).toMatchObject({
      actorRole: 'ADMIN',
      entityType: 'Category',
      ipAddress: expect.any(String),
    });
  });

  it('restricts admin routes', async () => {
    const customer = await createUser(ctx, 'CUSTOMER');
    await ctx.http().post('/api/v1/admin/categories').send({ name: 'X1' }).expect(401);
    await ctx
      .http()
      .post('/api/v1/admin/categories')
      .set(customer.auth)
      .send({ name: 'X1' })
      .expect(403);
    await ctx.http().get('/api/v1/admin/services').set(customer.auth).expect(403);
    await ctx.http().get('/api/v1/admin/categories/not-a-uuid').set(admin.auth).expect(400);
    await ctx
      .http()
      .get('/api/v1/admin/categories/01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f')
      .set(admin.auth)
      .expect(404);
  });
});
