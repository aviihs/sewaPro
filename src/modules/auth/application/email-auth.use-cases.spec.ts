import { beforeEach, describe, expect, it } from 'vitest';
import { aUser } from '../../../../test/unit/fixtures/users.js';
import { FakeUnitOfWork, FixedClock, mockOf } from '../../../../test/unit/mock.js';
import { AccountSuspendedError } from '../../../common/errors/auth.errors.js';
import { PasswordHasher } from '../../../common/ports/password-hasher.port.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import { UserNotFoundError } from '../../users/domain/users.errors.js';
import { CurrentPasswordIncorrectError, OtpInvalidError } from '../domain/auth.errors.js';
import { RefreshTokenRepository } from '../domain/refresh-token.js';
import { EmailCodes } from './email-codes.js';
import { ResendVerificationUseCase, VerifyEmailUseCase } from './email-verification.use-cases.js';
import {
  ChangePasswordUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
} from './password-reset.use-cases.js';
import { SessionIssuer } from './session-issuer.js';

const email = 'aarati@example.com';
const context = { ipAddress: null, userAgent: null, requestId: null };
const SENT = { expiresInSeconds: 600, resendAfterSeconds: 60 };

const codes = mockOf<EmailCodes>();
const users = mockOf<UserRepository>();
const sessions = mockOf<SessionIssuer>();
const refreshTokens = mockOf<RefreshTokenRepository>();
const hasher = mockOf<PasswordHasher>();
const clock = new FixedClock();
const uow = new FakeUnitOfWork();
const session = { accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: aUser() };

beforeEach(() => {
  codes.check.mockResolvedValue('otp-1');
  sessions.start.mockResolvedValue(session);
  hasher.hash.mockResolvedValue('new-hash');
});

describe('VerifyEmailUseCase', () => {
  const useCase = new VerifyEmailUseCase(codes, users, sessions, clock, uow);
  const input = { email, code: '123456' };

  it('marks the email verified, consumes the code and signs in', async () => {
    const pending = aUser({ emailVerifiedAt: null });
    const verified = aUser();
    users.findByEmail.mockResolvedValue(pending);
    users.markEmailVerified.mockResolvedValue(verified);

    await expect(useCase.execute(input, context)).resolves.toBe(session);
    expect(codes.check).toHaveBeenCalledWith(email, 'EMAIL_VERIFICATION', '123456');
    expect(codes.consume).toHaveBeenCalledWith('otp-1', clock.now());
    expect(users.markEmailVerified).toHaveBeenCalledWith('user-1', clock.now());
    expect(users.recordLogin).toHaveBeenCalledWith('user-1', clock.now());
    expect(sessions.start).toHaveBeenCalledWith(verified, context);
  });

  it('signs in an already verified account without changing it', async () => {
    users.findByEmail.mockResolvedValue(aUser());
    await useCase.execute(input, context);
    expect(users.markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects a bad code, a vanished account and a suspended account', async () => {
    codes.check.mockRejectedValueOnce(new OtpInvalidError());
    await expect(useCase.execute(input, context)).rejects.toBeInstanceOf(OtpInvalidError);

    users.findByEmail.mockResolvedValueOnce(null);
    await expect(useCase.execute(input, context)).rejects.toBeInstanceOf(OtpInvalidError);

    users.findByEmail.mockResolvedValueOnce(aUser({ status: 'SUSPENDED', emailVerifiedAt: null }));
    await expect(useCase.execute(input, context)).rejects.toBeInstanceOf(AccountSuspendedError);
    expect(codes.consume).not.toHaveBeenCalled();
    expect(sessions.start).not.toHaveBeenCalled();
  });
});

describe('ResendVerificationUseCase', () => {
  const useCase = new ResendVerificationUseCase(codes, users);

  it('sends a code only to an unverified, active account and always answers the same', async () => {
    users.findByEmail
      .mockResolvedValueOnce(aUser({ emailVerifiedAt: null }))
      .mockResolvedValueOnce(aUser())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(aUser({ emailVerifiedAt: null, status: 'SUSPENDED' }));

    for (let i = 0; i < 4; i += 1) await expect(useCase.execute(email)).resolves.toEqual(SENT);
    expect(codes.send).toHaveBeenCalledTimes(1);
    expect(codes.send).toHaveBeenCalledWith(email, 'EMAIL_VERIFICATION', 'Aarati Sharma');
  });
});

describe('ForgotPasswordUseCase', () => {
  const useCase = new ForgotPasswordUseCase(codes, users);

  it('sends a reset code only to active password accounts and always answers the same', async () => {
    users.findByEmail
      .mockResolvedValueOnce(aUser())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(aUser({ passwordHash: null }))
      .mockResolvedValueOnce(aUser({ status: 'SUSPENDED' }));

    for (let i = 0; i < 4; i += 1) await expect(useCase.execute(email)).resolves.toEqual(SENT);
    expect(codes.send).toHaveBeenCalledTimes(1);
    expect(codes.send).toHaveBeenCalledWith(email, 'PASSWORD_RESET', 'Aarati Sharma');
  });
});

describe('ResetPasswordUseCase', () => {
  const useCase = new ResetPasswordUseCase(codes, users, refreshTokens, hasher, clock, uow);
  const input = { email, code: '123456', newPassword: 'Pokhara2031' };

  it('sets the new hash, verifies the email and signs out every session', async () => {
    users.findByEmail.mockResolvedValue(aUser({ emailVerifiedAt: null }));
    await useCase.execute(input);

    expect(codes.check).toHaveBeenCalledWith(email, 'PASSWORD_RESET', '123456');
    expect(hasher.hash).toHaveBeenCalledWith('Pokhara2031');
    expect(codes.consume).toHaveBeenCalledWith('otp-1', clock.now());
    expect(users.updatePasswordHash).toHaveBeenCalledWith('user-1', 'new-hash');
    expect(users.markEmailVerified).toHaveBeenCalledWith('user-1', clock.now());
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1', clock.now());
  });

  it('leaves a verified email alone and rejects bad codes or unknown accounts', async () => {
    users.findByEmail.mockResolvedValueOnce(aUser());
    await useCase.execute(input);
    expect(users.markEmailVerified).not.toHaveBeenCalled();

    users.findByEmail.mockResolvedValueOnce(null);
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(OtpInvalidError);
    codes.check.mockRejectedValueOnce(new OtpInvalidError());
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(OtpInvalidError);
    expect(users.updatePasswordHash).toHaveBeenCalledTimes(1);
  });
});

describe('ChangePasswordUseCase', () => {
  const useCase = new ChangePasswordUseCase(users, refreshTokens, hasher, sessions, clock, uow);
  const input = { currentPassword: 'Kathmandu2030', newPassword: 'Pokhara2031' };

  it('checks the current password, revokes all sessions and starts a new one', async () => {
    users.findById.mockResolvedValue(aUser());
    hasher.verify.mockResolvedValue(true);

    await expect(useCase.execute('user-1', input, context)).resolves.toBe(session);
    expect(hasher.verify).toHaveBeenCalledWith('hash', 'Kathmandu2030');
    expect(users.updatePasswordHash).toHaveBeenCalledWith('user-1', 'new-hash');
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1', clock.now());
    expect(sessions.start).toHaveBeenCalledWith(aUser(), context);
  });

  it('rejects a wrong current password, a password-less account and a missing user', async () => {
    users.findById.mockResolvedValueOnce(aUser());
    hasher.verify.mockResolvedValueOnce(false);
    await expect(useCase.execute('user-1', input, context)).rejects.toBeInstanceOf(
      CurrentPasswordIncorrectError,
    );
    users.findById.mockResolvedValueOnce(aUser({ passwordHash: null }));
    await expect(useCase.execute('user-1', input, context)).rejects.toBeInstanceOf(
      CurrentPasswordIncorrectError,
    );
    users.findById.mockResolvedValueOnce(null);
    await expect(useCase.execute('user-1', input, context)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
  });
});
