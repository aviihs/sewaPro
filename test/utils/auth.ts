import { type Role } from '../../src/common/auth/role.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2-password-hasher.js';
import { type TestContext } from './create-test-app.js';

export const TEST_PASSWORD = 'Kathmandu2030';

let sequence = 0;

/** Unique, valid Nepal mobile number per call. */
export function nextPhone(): string {
  sequence += 1;
  return `+97798${String(Date.now() % 1_000_000).padStart(6, '0')}${String(sequence % 100).padStart(2, '0')}`;
}

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly phone: string;
  readonly role: Role;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly auth: { readonly Authorization: string };
}

const hasher = new Argon2PasswordHasher();

/** Inserts a user directly (any role/status), then signs in through the API. */
export async function createUser(
  ctx: TestContext,
  role: Role,
  options: { status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED'; fullName?: string } = {},
): Promise<TestUser> {
  const phone = nextPhone();
  const email = `${role.toLowerCase()}-${phone.slice(-8)}@test.sewapro.local`;
  const user = await ctx.prisma.user.create({
    data: {
      role,
      status: options.status ?? 'ACTIVE',
      fullName: options.fullName ?? `${role} ${phone.slice(-4)}`,
      email,
      phone,
      passwordHash: await hasher.hash(TEST_PASSWORD),
      emailVerifiedAt: new Date(),
    },
  });
  return signIn(ctx, { id: user.id, email, phone, role });
}

interface SessionBody {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: { readonly id: string };
}

/** Confirms the email with the last emailed code; returns the session it starts. */
export async function verifyEmail(ctx: TestContext, email: string): Promise<SessionBody> {
  const code = ctx.email.lastCodeFor(email, /Verify/);
  const res = await ctx.http().post('/api/v1/auth/verify-email').send({ email, code });
  if (res.status !== 200) throw new Error(`verify-email failed: ${JSON.stringify(res.body)}`);
  return (res.body as { data: SessionBody }).data;
}

export async function signIn(
  ctx: TestContext,
  user: { id: string; email: string; phone: string; role: Role },
): Promise<TestUser> {
  const res = await ctx
    .http()
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  const body = res.body as { data: { accessToken: string; refreshToken: string } };
  return {
    ...user,
    accessToken: body.data.accessToken,
    refreshToken: body.data.refreshToken,
    auth: { Authorization: `Bearer ${body.data.accessToken}` },
  };
}
