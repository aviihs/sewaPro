import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, createUser, nextPhone } from './utils/auth.js';
import { type TestContext, createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';

describe('Auth (e2e)', () => {
  let ctx: TestContext;
  const post = (path: string, body: object) => ctx.http().post(`/api/v1/auth/${path}`).send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  const registration = () => ({
    fullName: 'Aarati Sharma',
    email: `Aarati.${Date.now()}@Example.com`,
    phone: nextPhone().replace('+977', ''),
    password: TEST_PASSWORD,
  });

  describe('register + login', () => {
    it('registers a customer, normalizes input and never returns the hash', async () => {
      const body = registration();
      const res = await post('register', body).expect(201);

      expect(res.body.data).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          role: 'CUSTOMER',
          status: 'ACTIVE',
          email: body.email.toLowerCase(),
          phone: `+977${body.phone}`,
          phoneVerified: false,
        },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
      const stored = await ctx.prisma.user.findFirstOrThrow({
        where: { phone: `+977${body.phone}` },
      });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('rejects duplicates with a generic conflict', async () => {
      const body = registration();
      await post('register', body).expect(201);
      const res = await post('register', { ...body, email: 'other@example.com' }).expect(409);
      expect(res.body.error.code).toBe('ACCOUNT_ALREADY_EXISTS');
    });

    it('validates input and blocks mass assignment', async () => {
      const res = await post('register', {
        ...registration(),
        phone: '12345',
        password: 'onlyletters',
        role: 'ADMIN',
      }).expect(400);
      const fields = (res.body.error.details as { field: string }[]).map((d) => d.field).sort();
      expect(fields).toEqual(['password', 'phone', 'role']);
    });

    it('logs in and gives the same error for unknown email and wrong password', async () => {
      const body = registration();
      await post('register', body).expect(201);
      await post('login', { email: body.email, password: TEST_PASSWORD }).expect(200);

      const wrong = await post('login', { email: body.email, password: 'Wrong12345' }).expect(401);
      const unknown = await post('login', { email: 'nobody@x.com', password: 'Wrong12345' }).expect(
        401,
      );
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.error).toEqual({
        ...wrong.body.error,
        requestId: unknown.body.error.requestId,
      });
    });

    it('refuses suspended accounts', async () => {
      const user = await createUser(ctx, 'CUSTOMER');
      await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

      const login = await post('login', { email: user.email, password: TEST_PASSWORD }).expect(403);
      expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');
      const me = await ctx.http().get('/api/v1/auth/me').set(user.auth).expect(403);
      expect(me.body.error.code).toBe('ACCOUNT_SUSPENDED');
      await post('refresh', { refreshToken: user.refreshToken }).expect(403);
    });
  });

  describe('me', () => {
    it('requires a valid bearer token', async () => {
      expect((await ctx.http().get('/api/v1/auth/me').expect(401)).body.error.code).toBe(
        'AUTH_REQUIRED',
      );
      const bad = await ctx
        .http()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer x.y.z')
        .expect(401);
      expect(bad.body.error.code).toBe('ACCESS_TOKEN_INVALID');
    });

    it('returns the current user', async () => {
      const user = await createUser(ctx, 'PROVIDER', { status: 'PENDING' });
      const res = await ctx.http().get('/api/v1/auth/me').set(user.auth).expect(200);
      expect(res.body.data).toMatchObject({ id: user.id, role: 'PROVIDER', status: 'PENDING' });
    });
  });

  describe('refresh rotation', () => {
    it('rotates tokens and revokes the family when an old token is replayed', async () => {
      const user = await createUser(ctx, 'CUSTOMER');
      const first = await post('refresh', { refreshToken: user.refreshToken }).expect(200);
      const rotated = first.body.data.refreshToken as string;
      expect(rotated).not.toBe(user.refreshToken);

      const replay = await post('refresh', { refreshToken: user.refreshToken }).expect(401);
      expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');
      const afterTheft = await post('refresh', { refreshToken: rotated }).expect(401);
      expect(afterTheft.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    });

    it('rejects unknown tokens', async () => {
      const res = await post('refresh', { refreshToken: 'x'.repeat(64) }).expect(401);
      expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    });

    it('logout revokes the session and is idempotent', async () => {
      const user = await createUser(ctx, 'CUSTOMER');
      await post('logout', { refreshToken: user.refreshToken }).expect(204);
      await post('logout', { refreshToken: user.refreshToken }).expect(204);
      await post('refresh', { refreshToken: user.refreshToken }).expect(401);
    });
  });

  describe('phone OTP', () => {
    it('creates an account on first verified sign-in', async () => {
      const phone = nextPhone();
      const sent = await post('send-otp', { phone }).expect(200);
      expect(sent.body.data).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
      const code = ctx.sms.lastCodeFor(phone);

      const noName = await post('verify-otp', { phone, code }).expect(422);
      expect(noName.body.error.code).toBe('FULL_NAME_REQUIRED');

      const res = await post('verify-otp', { phone, code, fullName: 'Nabin Rai' }).expect(200);
      expect(res.body.data.user).toMatchObject({
        phone,
        fullName: 'Nabin Rai',
        phoneVerified: true,
      });
      const reuse = await post('verify-otp', { phone, code, fullName: 'Nabin Rai' }).expect(401);
      expect(reuse.body.error.code).toBe('OTP_INVALID');
    });

    it('signs in an existing user and stores only a hash of the code', async () => {
      const user = await createUser(ctx, 'CUSTOMER');
      await post('send-otp', { phone: user.phone }).expect(200);
      const code = ctx.sms.lastCodeFor(user.phone);
      const row = await ctx.prisma.otpCode.findFirstOrThrow({ where: { phone: user.phone } });
      expect(row.codeHash).not.toContain(code);

      const res = await post('verify-otp', { phone: user.phone, code }).expect(200);
      expect(res.body.data.user.id).toBe(user.id);
    });

    it('burns the code after 5 wrong attempts', async () => {
      const phone = nextPhone();
      await post('send-otp', { phone }).expect(200);
      const code = ctx.sms.lastCodeFor(phone);
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i += 1) {
        await post('verify-otp', { phone, code: wrong, fullName: 'X Y' }).expect(401);
      }
      await post('verify-otp', { phone, code, fullName: 'X Y' }).expect(401);
    });

    it('rate-limits sends per phone', async () => {
      const phone = nextPhone();
      await post('send-otp', { phone }).expect(200);
      const res = await post('send-otp', { phone }).expect(429);
      expect(res.body.error).toMatchObject({
        code: 'OTP_RATE_LIMITED',
        details: { retryAfterSeconds: 60 },
      });
    });

    it('validates phone and code format', async () => {
      await post('send-otp', { phone: '0123' }).expect(400);
      await post('verify-otp', { phone: nextPhone(), code: '12ab' }).expect(400);
    });
  });
});
