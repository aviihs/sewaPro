import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, createUser, nextPhone, verifyEmail } from './utils/auth.js';
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
    it('registers a customer without a session, emails a code and never returns the hash', async () => {
      const body = registration();
      const res = await post('register', body).expect(201);

      expect(res.body.data).toEqual({
        user: expect.objectContaining({
          role: 'CUSTOMER',
          status: 'ACTIVE',
          email: body.email.toLowerCase(),
          phone: `+977${body.phone}`,
          phoneVerified: false,
          emailVerified: false,
        }),
        verification: { expiresInSeconds: 600, resendAfterSeconds: 60 },
      });
      expect(ctx.email.lastCodeFor(body.email.toLowerCase())).toMatch(/^\d{6}$/);
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
      await verifyEmail(ctx, body.email.toLowerCase());
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

  describe('email verification', () => {
    const registered = async (): Promise<string> => {
      const body = registration();
      await post('register', body).expect(201);
      return body.email.toLowerCase();
    };

    it('blocks login until verified; the code signs in once and stores only a hash', async () => {
      const email = await registered();
      const blocked = await post('login', { email, password: TEST_PASSWORD }).expect(403);
      expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');
      const wrongPassword = await post('login', { email, password: 'Wrong12345' }).expect(401);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');

      const code = ctx.email.lastCodeFor(email);
      const row = await ctx.prisma.otpCode.findFirstOrThrow({ where: { recipient: email } });
      expect(row.codeHash).not.toContain(code);

      const res = await post('verify-email', { email, code }).expect(200);
      expect(res.body.data).toMatchObject({ tokenType: 'Bearer', user: { emailVerified: true } });
      const reuse = await post('verify-email', { email, code }).expect(401);
      expect(reuse.body.error.code).toBe('OTP_INVALID');
      await post('login', { email, password: TEST_PASSWORD }).expect(200);
    });

    it('burns the code after 5 wrong attempts', async () => {
      const email = await registered();
      const code = ctx.email.lastCodeFor(email);
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i += 1) await post('verify-email', { email, code: wrong }).expect(401);
      await post('verify-email', { email, code }).expect(401);
    });

    it('resends with a cooldown and answers the same for unknown or verified emails', async () => {
      const email = await registered();
      const sent = { expiresInSeconds: 600, resendAfterSeconds: 60 };
      const verified = await createUser(ctx, 'CUSTOMER');
      for (const target of [email, 'nobody@example.com', verified.email]) {
        expect(
          (await post('resend-verification', { email: target }).expect(200)).body.data,
        ).toEqual(sent);
      }
      expect(ctx.email.countFor(email)).toBe(1);
      expect(ctx.email.countFor(verified.email)).toBe(0);

      await ctx.prisma.otpCode.updateMany({
        where: { recipient: email },
        data: { createdAt: new Date(Date.now() - 120_000) },
      });
      await post('resend-verification', { email }).expect(200);
      expect(ctx.email.countFor(email)).toBe(2);
      await verifyEmail(ctx, email);
    });

    it('validates email and code format', async () => {
      await post('verify-email', { email: 'not-an-email', code: '12ab' }).expect(400);
      await post('resend-verification', {}).expect(400);
    });
  });

  describe('password reset and change', () => {
    it('resets with an emailed code and signs out every session', async () => {
      const user = await createUser(ctx, 'CUSTOMER');
      const unknown = await post('forgot-password', { email: 'nobody@example.com' }).expect(200);
      const known = await post('forgot-password', { email: user.email }).expect(200);
      expect(known.body.data).toEqual(unknown.body.data);

      const code = ctx.email.lastCodeFor(user.email, /Reset/);
      const newPassword = 'Pokhara2031';
      const wrong = code === '000000' ? '111111' : '000000';
      await post('reset-password', { email: user.email, code: wrong, newPassword }).expect(401);
      await post('reset-password', { email: user.email, code, newPassword }).expect(204);

      await post('refresh', { refreshToken: user.refreshToken }).expect(401);
      await post('login', { email: user.email, password: TEST_PASSWORD }).expect(401);
      await post('login', { email: user.email, password: newPassword }).expect(200);
      await post('reset-password', { email: user.email, code, newPassword }).expect(401);
    });

    it('a reset code also verifies an unverified email', async () => {
      const body = registration();
      const email = body.email.toLowerCase();
      await post('register', body).expect(201);
      await post('forgot-password', { email }).expect(200);
      const code = ctx.email.lastCodeFor(email, /Reset/);
      await post('reset-password', { email, code, newPassword: 'Pokhara2031' }).expect(204);
      await post('login', { email, password: 'Pokhara2031' }).expect(200);
    });

    it('changes the password with the current one and rotates sessions', async () => {
      const user = await createUser(ctx, 'CUSTOMER');
      const change = (body: object) =>
        ctx.http().post('/api/v1/auth/change-password').set(user.auth).send(body);

      const wrong = await change({ currentPassword: 'Wrong12345', newPassword: 'Pokhara2031' });
      expect(wrong.status).toBe(422);
      expect(wrong.body.error.code).toBe('CURRENT_PASSWORD_INCORRECT');
      await change({ currentPassword: TEST_PASSWORD, newPassword: 'short' }).expect(400);

      const res = await change({ currentPassword: TEST_PASSWORD, newPassword: 'Pokhara2031' });
      expect(res.status).toBe(200);
      await post('refresh', { refreshToken: user.refreshToken }).expect(401);
      await post('refresh', { refreshToken: res.body.data.refreshToken }).expect(200);
      await post('login', { email: user.email, password: 'Pokhara2031' }).expect(200);
      await ctx.http().post('/api/v1/auth/change-password').send({}).expect(401);
    });
  });

  it('no longer offers phone OTP login', async () => {
    await post('send-otp', { phone: nextPhone() }).expect(404);
    await post('verify-otp', { phone: nextPhone(), code: '123456' }).expect(404);
  });
});
