import { type Test } from 'supertest';
import { type TestUser } from './auth.js';
import { type TestContext } from './create-test-app.js';

const NEPAL_OFFSET_MS = 345 * 60_000;

/**
 * An ISO instant `daysAhead` days from now at `hour`:`minute` Nepal time,
 * skipped forward past Saturdays (the providers' day off in test schedules).
 */
export function nepalSlot(daysAhead: number, hour: number, minute = 0): string {
  const local = new Date(Date.now() + NEPAL_OFFSET_MS + daysAhead * 86_400_000);
  if (local.getUTCDay() === 6) local.setUTCDate(local.getUTCDate() + 1);
  const date = local.toISOString().slice(0, 10);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${date}T${hh}:${mm}:00+05:45`).toISOString();
}

export const BALUWATAR = {
  label: 'Home',
  line1: 'House 12, Ward 4',
  area: 'Baluwatar',
  city: 'Kathmandu',
  landmark: 'Near the temple',
  latitude: 27.7215,
  longitude: 85.3304,
};

export async function createAddress(ctx: TestContext, customer: TestUser): Promise<string> {
  const res = await ctx
    .http()
    .post('/api/v1/addresses')
    .set(customer.auth)
    .send(BALUWATAR)
    .expect(201);
  return (res.body as { data: { id: string } }).data.id;
}

export function book(
  ctx: TestContext,
  customer: TestUser,
  body: { providerId: string; serviceId: string; addressId: string; scheduledAt: string },
  idempotencyKey?: string,
): Test {
  const req = ctx.http().post('/api/v1/bookings').set(customer.auth);
  if (idempotencyKey) void req.set('Idempotency-Key', idempotencyKey);
  return req.send(body);
}

export function providerAction(
  ctx: TestContext,
  provider: TestUser,
  bookingId: string,
  action: string,
  body: object = {},
): Test {
  return ctx
    .http()
    .post(`/api/v1/providers/me/bookings/${bookingId}/${action}`)
    .set(provider.auth)
    .send(body);
}
