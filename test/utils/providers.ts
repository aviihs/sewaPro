import type { Test } from 'supertest';
import { SAMPLE_FILES } from '../unit/fixtures/files.js';
import { TEST_PASSWORD, type TestUser, nextPhone } from './auth.js';
import { type TestContext } from './create-test-app.js';

export interface TestProvider extends TestUser {
  readonly providerId: string;
}

export const KATHMANDU = { latitude: 27.7172, longitude: 85.324 };

/** Registers a provider through the public API (PENDING_VERIFICATION). */
export async function registerProvider(
  ctx: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<TestProvider> {
  const phone = nextPhone();
  const email = `provider-${phone.slice(-8)}@test.sewapro.local`;
  const res = await ctx
    .http()
    .post('/api/v1/providers/register')
    .send({
      fullName: 'Ram Thapa',
      email,
      phone,
      password: TEST_PASSWORD,
      businessName: 'Thapa Electricals',
      experienceYears: 6,
      serviceRadiusKm: 10,
      ...KATHMANDU,
      ...overrides,
    });
  if (res.status !== 201)
    throw new Error(`provider registration failed: ${JSON.stringify(res.body)}`);
  const body = res.body as {
    data: { accessToken: string; refreshToken: string; user: { id: string } };
  };
  const provider = await ctx.prisma.provider.findUniqueOrThrow({
    where: { userId: body.data.user.id },
  });
  return {
    id: body.data.user.id,
    email,
    phone,
    role: 'PROVIDER',
    accessToken: body.data.accessToken,
    refreshToken: body.data.refreshToken,
    auth: { Authorization: `Bearer ${body.data.accessToken}` },
    providerId: provider.id,
  };
}

export function uploadDocument(ctx: TestContext, provider: TestUser, type = 'CITIZENSHIP'): Test {
  return ctx
    .http()
    .post('/api/v1/providers/me/documents')
    .set(provider.auth)
    .field('type', type)
    .attach('file', SAMPLE_FILES.pdf, {
      filename: 'citizenship.pdf',
      contentType: 'application/pdf',
    });
}

/** Creates an active category + service directly; returns their ids. */
export async function createService(
  ctx: TestContext,
  name = 'Fan Installation',
): Promise<{ categoryId: string; serviceId: string }> {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const category = await ctx.prisma.category.create({
    data: { name: `Electrician ${suffix}`, slug: `electrician-${suffix}` },
  });
  const service = await ctx.prisma.service.create({
    data: { categoryId: category.id, name, slug: `svc-${suffix}` },
  });
  return { categoryId: category.id, serviceId: service.id };
}

/**
 * A fully onboarded provider: registered through the API, offering a FIXED-price
 * service, working Sunday to Friday 06:00 to 20:00, and verified by an admin.
 */
export async function verifiedProvider(
  ctx: TestContext,
  admin: TestUser,
  options: { serviceId?: string; pricingType?: string; price?: number | null } = {},
): Promise<TestProvider & { serviceId: string }> {
  const provider = await registerProvider(ctx);
  const serviceId = options.serviceId ?? (await createService(ctx)).serviceId;
  await uploadDocument(ctx, provider).expect(201);
  const pricingType = options.pricingType ?? 'FIXED';
  const price = pricingType === 'QUOTATION' ? null : (options.price ?? 1500);
  await ctx
    .http()
    .put(`/api/v1/providers/me/services/${serviceId}`)
    .set(provider.auth)
    .send({ pricingType, price })
    .expect(200);
  const windows = [0, 1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 360,
    endMinute: 1200,
  }));
  await ctx
    .http()
    .put('/api/v1/providers/me/availability/windows')
    .set(provider.auth)
    .send({ windows })
    .expect(200);
  await ctx
    .http()
    .post(`/api/v1/admin/providers/${provider.providerId}/verify`)
    .set(admin.auth)
    .expect(200);
  return { ...provider, serviceId };
}
