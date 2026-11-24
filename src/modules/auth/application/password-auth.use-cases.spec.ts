import { beforeEach, describe, expect, it } from 'vitest';
import { aUser } from '../../../../test/unit/fixtures/users.js';
import { FixedClock, mockOf } from '../../../../test/unit/mock.js';
import { AccountSuspendedError } from '../../../common/errors/auth.errors.js';
import { PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { InvalidCredentialsError } from '../domain/auth.errors.js';
import { RefreshTokenRepository } from '../domain/refresh-token.js';
import { AccessTokenService, AuthSecrets, AuthSettings } from './auth.ports.js';
import { LoginUseCase } from './login.use-case.js';
import { RegisterCustomerUseCase } from './register-customer.use-case.js';
import { SessionIssuer } from './session-issuer.js';

const context = { ipAddress: '10.0.0.1', userAgent: 'app/1.0', requestId: 'req-1' };

function buildIssuer(clock: FixedClock) {
  const accessTokens = mockOf<AccessTokenService>();
  const refreshTokens = mockOf<RefreshTokenRepository>();
  const secrets = mockOf<AuthSecrets>();
  const settings: AuthSettings = { accessTtlSeconds: 900, refreshTtlDays: 30 };
  accessTokens.sign.mockResolvedValue('access.jwt');
  secrets.newRefreshToken.mockReturnValue('refresh-raw');
  secrets.hashRefreshToken.mockReturnValue('refresh-hash');
  secrets.newId.mockReturnValue('family-1');
  refreshTokens.create.mockResolvedValue({
    id: 'rt-1',
    userId: 'user-1',
    familyId: 'family-1',
    expiresAt: clock.now(),
    revokedAt: null,
  });
  const issuer = new SessionIssuer(accessTokens, refreshTokens, secrets, settings, clock);
  return { issuer, accessTokens, refreshTokens };
}

describe('SessionIssuer', () => {
  it('stores only the refresh token hash with a 30-day expiry in a new family', async () => {
    const clock = new FixedClock();
    const { issuer, refreshTokens, accessTokens } = buildIssuer(clock);

    const session = await issuer.start(aUser(), context);

    expect(session).toMatchObject({
      accessToken: 'access.jwt',
      refreshToken: 'refresh-raw',
      expiresIn: 900,
    });
    expect(refreshTokens.create).toHaveBeenCalledWith({
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash: 'refresh-hash',
      expiresAt: new Date(clock.now().getTime() + 30 * 86_400_000),
      device: 'app/1.0',
      ipAddress: '10.0.0.1',
    });
    expect(accessTokens.sign).toHaveBeenCalledWith({ id: 'user-1', role: 'CUSTOMER' });
  });

  it('continues an existing family on rotation', async () => {
    const { issuer, refreshTokens } = buildIssuer(new FixedClock());
    const session = await issuer.continue(aUser(), 'family-9', context);
    expect(session.refreshTokenId).toBe('rt-1');
    expect(refreshTokens.create).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'family-9' }),
    );
  });
});

describe('RegisterCustomerUseCase', () => {
  it('creates an active customer with a hashed password and signs in', async () => {
    const users = mockOf<UserRepository>();
    const hasher = mockOf<PasswordHasher>();
    const sessions = mockOf<SessionIssuer>();
    hasher.hash.mockResolvedValue('argon-hash');
    users.create.mockResolvedValue(aUser());
    sessions.start.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      user: aUser(),
    });

    const input = {
      fullName: 'A',
      email: 'a@x.com',
      phone: '+9779841234567',
      password: 'pass1234',
    };
    await new RegisterCustomerUseCase(users, hasher, sessions).execute(input, context);

    expect(users.create).toHaveBeenCalledWith({
      role: 'CUSTOMER',
      status: 'ACTIVE',
      fullName: 'A',
      email: 'a@x.com',
      phone: '+9779841234567',
      passwordHash: 'argon-hash',
      phoneVerifiedAt: null,
    });
    expect(sessions.start).toHaveBeenCalledWith(aUser(), context);
  });
});

describe('LoginUseCase', () => {
  const users = mockOf<UserRepository>();
  const hasher = mockOf<PasswordHasher>();
  const sessions = mockOf<SessionIssuer>();
  const clock = new FixedClock();
  let useCase: LoginUseCase;
  const input = { email: 'aarati@example.com', password: 'pass1234' };

  beforeEach(() => {
    useCase = new LoginUseCase(users, hasher, sessions, clock);
    hasher.hash.mockResolvedValue('dummy-hash');
    sessions.start.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      user: aUser(),
    });
  });

  it('signs in with the right password and records the login', async () => {
    users.findByEmail.mockResolvedValue(aUser());
    hasher.verify.mockResolvedValue(true);

    await expect(useCase.execute(input, context)).resolves.toMatchObject({ accessToken: 'a' });
    expect(users.recordLogin).toHaveBeenCalledWith('user-1', clock.now());
  });

  it('rejects a wrong password generically', async () => {
    users.findByEmail.mockResolvedValue(aUser());
    hasher.verify.mockResolvedValue(false);
    await expect(useCase.execute(input, context)).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('does the same hashing work for unknown emails and password-less accounts', async () => {
    hasher.verify.mockResolvedValue(false);
    users.findByEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(aUser({ passwordHash: null }));

    await expect(useCase.execute(input, context)).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(useCase.execute(input, context)).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(hasher.verify).toHaveBeenNthCalledWith(1, 'dummy-hash', 'pass1234');
    expect(hasher.hash).toHaveBeenCalledTimes(1);
  });

  it('reveals suspension only after a correct password', async () => {
    users.findByEmail.mockResolvedValue(aUser({ status: 'SUSPENDED' }));
    hasher.verify.mockResolvedValue(true);
    await expect(useCase.execute(input, context)).rejects.toBeInstanceOf(AccountSuspendedError);
    expect(users.recordLogin).not.toHaveBeenCalled();
  });
});
