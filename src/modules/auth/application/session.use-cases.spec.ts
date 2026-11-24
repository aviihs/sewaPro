import { beforeEach, describe, expect, it } from 'vitest';
import { aUser } from '../../../../test/unit/fixtures/users.js';
import { FakeUnitOfWork, FixedClock, mockOf } from '../../../../test/unit/mock.js';
import {
  AccountSuspendedError,
  InvalidAccessTokenError,
} from '../../../common/errors/auth.errors.js';
import { Cache } from '../../../common/ports/cache.port.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { InvalidRefreshTokenError, RefreshTokenReuseError } from '../domain/auth.errors.js';
import { type RefreshToken, RefreshTokenRepository } from '../domain/refresh-token.js';
import { AccessTokenService, AuthSecrets } from './auth.ports.js';
import { AuthenticateAccessTokenUseCase } from './authenticate-access-token.use-case.js';
import { LogoutUseCase } from './logout.use-case.js';
import { RefreshSessionUseCase } from './refresh-session.use-case.js';
import { SessionIssuer } from './session-issuer.js';

const context = { ipAddress: null, userAgent: null, requestId: null };

describe('RefreshSessionUseCase', () => {
  const tokens = mockOf<RefreshTokenRepository>();
  const users = mockOf<UserRepository>();
  const secrets = mockOf<AuthSecrets>();
  const sessions = mockOf<SessionIssuer>();
  const clock = new FixedClock();
  const useCase = new RefreshSessionUseCase(
    tokens,
    users,
    secrets,
    sessions,
    clock,
    new FakeUnitOfWork(),
  );
  const active: RefreshToken = {
    id: 'rt-1',
    userId: 'user-1',
    familyId: 'fam-1',
    expiresAt: new Date(clock.now().getTime() + 1000),
    revokedAt: null,
  };

  beforeEach(() => {
    secrets.hashRefreshToken.mockReturnValue('hash');
    tokens.findByHash.mockResolvedValue(active);
    users.findById.mockResolvedValue(aUser());
    tokens.revokeIfActive.mockResolvedValue(true);
    sessions.continue.mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
      refreshTokenId: 'rt-2',
      expiresIn: 900,
      user: aUser(),
    });
  });

  it('rotates: issues a token in the same family and revokes the old one', async () => {
    const session = await useCase.execute('r1', context);
    expect(session.refreshToken).toBe('r2');
    expect(sessions.continue).toHaveBeenCalledWith(aUser(), 'fam-1', context);
    expect(tokens.revokeIfActive).toHaveBeenCalledWith('rt-1', clock.now(), 'rt-2');
    expect(tokens.revokeFamily).not.toHaveBeenCalled();
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    tokens.findByHash.mockResolvedValue({ ...active, revokedAt: clock.now() });
    await expect(useCase.execute('r1', context)).rejects.toBeInstanceOf(RefreshTokenReuseError);
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam-1', clock.now());
  });

  it('treats losing a concurrent rotation as reuse', async () => {
    tokens.revokeIfActive.mockResolvedValue(false);
    await expect(useCase.execute('r1', context)).rejects.toBeInstanceOf(RefreshTokenReuseError);
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam-1', clock.now());
  });

  it('propagates unexpected errors without revoking', async () => {
    sessions.continue.mockRejectedValue(new Error('db down'));
    await expect(useCase.execute('r1', context)).rejects.toThrow('db down');
    expect(tokens.revokeFamily).not.toHaveBeenCalled();
  });

  it('rejects unknown and expired tokens', async () => {
    tokens.findByHash.mockResolvedValueOnce(null);
    await expect(useCase.execute('x', context)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    tokens.findByHash.mockResolvedValueOnce({ ...active, expiresAt: clock.now() });
    await expect(useCase.execute('x', context)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('ends sessions of suspended or deleted users', async () => {
    users.findById.mockResolvedValueOnce(aUser({ status: 'SUSPENDED' }));
    await expect(useCase.execute('r1', context)).rejects.toBeInstanceOf(AccountSuspendedError);
    users.findById.mockResolvedValueOnce(null);
    await expect(useCase.execute('r1', context)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    expect(tokens.revokeFamily).toHaveBeenCalledTimes(2);
  });
});

describe('LogoutUseCase', () => {
  const tokens = mockOf<RefreshTokenRepository>();
  const secrets = mockOf<AuthSecrets>();
  const clock = new FixedClock();
  const useCase = new LogoutUseCase(tokens, secrets, clock);

  it('revokes the family of a known token', async () => {
    secrets.hashRefreshToken.mockReturnValue('hash');
    tokens.findByHash.mockResolvedValue({
      id: 'rt',
      userId: 'u',
      familyId: 'fam',
      expiresAt: clock.now(),
      revokedAt: null,
    });
    await useCase.execute('r');
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam', clock.now());
  });

  it('is silent for unknown tokens', async () => {
    tokens.findByHash.mockResolvedValue(null);
    await expect(useCase.execute('r')).resolves.toBeUndefined();
    expect(tokens.revokeFamily).not.toHaveBeenCalled();
  });
});

describe('AuthenticateAccessTokenUseCase', () => {
  const accessTokens = mockOf<AccessTokenService>();
  const users = mockOf<UserRepository>();
  const cache = mockOf<Cache>();
  const useCase = new AuthenticateAccessTokenUseCase(accessTokens, users, cache);

  beforeEach(() => {
    accessTokens.verify.mockResolvedValue({ id: 'user-1', role: 'CUSTOMER' });
    cache.get.mockResolvedValue(undefined);
  });

  it('returns the subject and caches the status', async () => {
    users.findById.mockResolvedValue(aUser());
    await expect(useCase.execute('t')).resolves.toEqual({ id: 'user-1', role: 'CUSTOMER' });
    expect(cache.set).toHaveBeenCalledWith({ name: 'auth:user-status:user-1' }, 'ACTIVE', 30_000);
  });

  it('uses the cached status', async () => {
    cache.get.mockResolvedValue('PENDING');
    await expect(useCase.execute('t')).resolves.toBeDefined();
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('rejects invalid tokens, deleted users and suspended users', async () => {
    accessTokens.verify.mockResolvedValueOnce(null);
    await expect(useCase.execute('t')).rejects.toBeInstanceOf(InvalidAccessTokenError);

    users.findById.mockResolvedValueOnce(null);
    await expect(useCase.execute('t')).rejects.toBeInstanceOf(InvalidAccessTokenError);

    cache.get.mockResolvedValueOnce('SUSPENDED');
    await expect(useCase.execute('t')).rejects.toBeInstanceOf(AccountSuspendedError);
  });
});
