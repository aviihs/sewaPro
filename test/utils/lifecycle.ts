import { type TestUser } from './auth.js';
import { book, createAddress, nepalSlot, providerAction } from './bookings.js';
import { type TestContext } from './create-test-app.js';
import { type TestProvider } from './providers.js';

/** Books, accepts, travels, starts and completes a job; returns the booking id. */
export async function completedBooking(
  ctx: TestContext,
  customer: TestUser,
  provider: TestProvider & { serviceId: string },
  daysAhead = 2,
  finalAmount = 1500,
): Promise<string> {
  const addressId = await createAddress(ctx, customer);
  const res = await book(ctx, customer, {
    providerId: provider.providerId,
    serviceId: provider.serviceId,
    addressId,
    scheduledAt: nepalSlot(daysAhead, 10),
  }).expect(201);
  const id = (res.body as { data: { id: string } }).data.id;
  for (const action of ['accept', 'on-the-way', 'start']) {
    await providerAction(ctx, provider, id, action).expect(200);
  }
  await providerAction(ctx, provider, id, 'complete', { finalAmount }).expect(200);
  return id;
}
