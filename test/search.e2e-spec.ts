import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { toNepalTime } from '../src/common/time/nepal-time.js';
import { type TestUser, createUser } from './utils/auth.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import {
  KATHMANDU,
  type TestProvider,
  createService,
  registerProvider,
  verifiedProvider,
} from './utils/providers.js';

type Hit = {
  id: string;
  displayName: string;
  distanceKm: number | null;
  minPrice: number | null;
  ratingAverage: number;
  services: { serviceId: string; price: number | null }[];
};

/** About 1.11 km per 0.01° of latitude. */
const north = (km: number) => ({
  latitude: KATHMANDU.latitude + km / 111.2,
  longitude: KATHMANDU.longitude,
});
const ORIGIN = `lat=${KATHMANDU.latitude}&lng=${KATHMANDU.longitude}`;

/** Nepal calendar date `days` from now. */
const nepalDate = (days: number): string =>
  toNepalTime(new Date(Date.now() + days * 86_400_000)).date;
const nextSaturday = (): string => {
  for (let days = 1; ; days += 1) {
    const date = nepalDate(days);
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 6) return date;
  }
};

describe('Search (e2e)', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let serviceId: string;
  let categoryId: string;
  let near: TestProvider;
  let mid: TestProvider;
  let far: TestProvider;

  const search = (query = '') => ctx.http().get(`/api/v1/providers?${query}`);
  const ids = async (query: string): Promise<string[]> => {
    const res = await search(query).expect(200);
    return (res.body.data as Hit[]).map((h) => h.id);
  };
  const place = (provider: TestProvider, data: Record<string, unknown>) =>
    ctx.prisma.provider.update({ where: { id: provider.providerId }, data });

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
    ({ serviceId, categoryId } = await createService(ctx, 'Fan Installation'));
    near = await verifiedProvider(ctx, admin, { serviceId, price: 2500 });
    mid = await verifiedProvider(ctx, admin, { serviceId, price: 800 });
    far = await verifiedProvider(ctx, admin, { serviceId, pricingType: 'QUOTATION' });
    await place(near, { ...north(1), businessName: 'Near Electricals', ratingAverage: 3.5 });
    await place(mid, { ...north(5), businessName: 'Mid Wiring Works', ratingAverage: 4.8 });
    await place(far, {
      ...north(20),
      businessName: 'Far Fixers',
      serviceRadiusKm: 30,
      ratingAverage: 4.2,
      experienceYears: 15,
    });
  });

  it('lists nearest first with distanceKm, within radius and the provider travel radius', async () => {
    const res = await search(ORIGIN).expect(200);
    expect(res.body.meta).toMatchObject({ page: 1, totalItems: 2, totalPages: 1 });
    const hits = res.body.data as Hit[];
    expect(hits.map((h) => h.id)).toEqual([near.providerId, mid.providerId]);
    expect(hits[0].distanceKm).toBeCloseTo(1, 1);
    expect(hits[1].distanceKm).toBeCloseTo(5, 1);
    expect(hits[0]).toMatchObject({ displayName: 'Near Electricals', minPrice: 2500 });
    expect(hits[0].services).toEqual([
      expect.objectContaining({ serviceId, serviceName: 'Fan Installation', price: 2500 }),
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/phone|email|latitude|longitude/);

    expect(await ids(`${ORIGIN}&radiusKm=25`)).toEqual([
      near.providerId,
      mid.providerId,
      far.providerId,
    ]);
    // Far is within 25 km but only travels 10 km now.
    await place(far, { serviceRadiusKm: 10 });
    expect(await ids(`${ORIGIN}&radiusKm=25`)).toHaveLength(2);
    expect(await ids(`${ORIGIN}&radiusKm=2`)).toEqual([near.providerId]);
  });

  it('without a location sorts by rating and has no distance', async () => {
    const res = await search().expect(200);
    expect((res.body.data as Hit[]).map((h) => h.id)).toEqual([
      mid.providerId,
      far.providerId,
      near.providerId,
    ]);
    expect((res.body.data as Hit[]).every((h) => h.distanceKm === null)).toBe(true);
  });

  it('sorts by price with quotation-only providers last', async () => {
    expect(await ids(`${ORIGIN}&radiusKm=25&sortBy=price`)).toEqual([
      mid.providerId,
      near.providerId,
      far.providerId,
    ]);
    expect(await ids(`${ORIGIN}&radiusKm=25&sortBy=rating`)).toEqual([
      mid.providerId,
      far.providerId,
      near.providerId,
    ]);
  });

  it('filters by service, category, rating, price, experience and text', async () => {
    const other = await createService(ctx, 'Leak Repair');
    const plumber = await verifiedProvider(ctx, admin, { serviceId: other.serviceId, price: 900 });
    await place(plumber, { businessName: 'Pani Plumbing' });

    expect(await ids(`serviceId=${serviceId}`)).toHaveLength(3);
    expect(await ids(`serviceId=${other.serviceId}`)).toEqual([plumber.providerId]);
    expect(await ids(`categoryId=${categoryId}`)).not.toContain(plumber.providerId);
    expect(await ids('minRating=4.5')).toEqual([mid.providerId]);
    expect(await ids('minPrice=850&maxPrice=3000')).toEqual([near.providerId, plumber.providerId]);
    expect(await ids('maxPrice=850')).toEqual([mid.providerId]);
    expect(await ids('minExperience=10')).toEqual([far.providerId]);
    expect(await ids('q=wiring')).toEqual([mid.providerId]);
    expect(await ids('q=leak')).toEqual([plumber.providerId]);
    expect(await ids('q=100%25')).toEqual([]);
    expect(await ids('verifiedOnly=true&q=fixers')).toEqual([far.providerId]);
  });

  it('filters by working day and blocked dates', async () => {
    const workday = nepalDate(new Date(`${nepalDate(1)}T00:00:00Z`).getUTCDay() === 6 ? 2 : 1);
    expect(await ids(`availableOn=${nextSaturday()}`)).toEqual([]);
    expect(await ids(`availableOn=${workday}`)).toHaveLength(3);
    await ctx
      .http()
      .post('/api/v1/providers/me/availability/blocked-dates')
      .set(mid.auth)
      .send({ date: workday, reason: 'Festival' })
      .expect(201);
    expect(await ids(`availableOn=${workday}`)).not.toContain(mid.providerId);
  });

  it('hides pending, unavailable, suspended and deactivated listings', async () => {
    const pending = await registerProvider(ctx);
    await place(near, { isAvailable: false });
    await ctx.prisma.user.update({ where: { id: mid.id }, data: { status: 'SUSPENDED' } });
    await ctx.prisma.providerService.updateMany({
      where: { providerId: far.providerId },
      data: { isActive: false },
    });
    const visible = await ids('');
    expect(visible).toEqual([]);
    expect(visible).not.toContain(pending.providerId);
    await ctx.http().get(`/api/v1/providers/${pending.providerId}`).expect(404);
    await ctx.http().get(`/api/v1/providers/${mid.providerId}`).expect(404);
  });

  it('paginates with a stable order', async () => {
    const first = await search(`${ORIGIN}&radiusKm=25&limit=2`).expect(200);
    const second = await search(`${ORIGIN}&radiusKm=25&limit=2&page=2`).expect(200);
    expect(first.body.meta).toMatchObject({ totalItems: 3, totalPages: 2, hasNextPage: true });
    expect((second.body.data as Hit[]).map((h) => h.id)).toEqual([far.providerId]);
  });

  it('shows a public profile without contact details', async () => {
    const res = await ctx.http().get(`/api/v1/providers/${mid.providerId}`).expect(200);
    expect(res.body.data).toMatchObject({
      id: mid.providerId,
      displayName: 'Mid Wiring Works',
      ratingAverage: 4.8,
      isAvailable: true,
      services: [expect.objectContaining({ serviceId, pricingType: 'FIXED', price: 800 })],
      portfolio: [],
    });
    expect(res.body.data.weeklyHours).toHaveLength(6);
    expect(JSON.stringify(res.body)).not.toMatch(/phone|email|latitude|longitude|userId/);
    await ctx.http().get('/api/v1/providers/not-a-uuid').expect(400);
    await ctx.http().get('/api/v1/providers/0190a000-0000-7000-8000-000000000000').expect(404);
  });

  it('keeps /providers/me working for providers', async () => {
    const res = await ctx.http().get('/api/v1/providers/me').set(near.auth).expect(200);
    expect(res.body.data.id).toBe(near.providerId);
    await ctx.http().get('/api/v1/providers/me').expect(401);
  });

  it.each([
    [`lat=${KATHMANDU.latitude}`, 'LOCATION_INCOMPLETE'],
    ['radiusKm=5', 'RADIUS_NEEDS_LOCATION'],
    ['sortBy=distance', 'DISTANCE_SORT_NEEDS_LOCATION'],
    ['minPrice=500&maxPrice=100', 'PRICE_RANGE_INVERTED'],
    [`availableOn=${nepalDate(-2)}`, 'AVAILABLE_ON_OUT_OF_RANGE'],
  ])('rejects %s (%s)', async (query, reason) => {
    const res = await search(query).expect(400);
    expect(res.body.error).toMatchObject({ code: 'INVALID_SEARCH_QUERY', details: { reason } });
  });

  it.each([
    'lat=10&lng=85.3',
    `${ORIGIN}&radiusKm=51`,
    'minRating=6',
    'sortBy=cheapest',
    'availableOn=tomorrow',
    'serviceId=abc',
    'limit=101',
    'unknown=1',
  ])('rejects invalid parameters: %s', async (query) => {
    const res = await search(query).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
