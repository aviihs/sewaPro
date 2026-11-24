import { beforeEach, describe, expect, it } from 'vitest';
import { aUser } from '../../../../test/unit/fixtures/users.js';
import { FakeUnitOfWork, FixedClock, mockOf } from '../../../../test/unit/mock.js';
import { AccountSuspendedError } from '../../../common/errors/auth.errors.js';
import { SmsSender } from '../../../common/ports/messaging.port.js';
import { UserRepository } from '../../users/domain/user.repository.js';
import {
  FullNameRequiredError,
  OtpInvalidError,
  OtpRateLimitedError,
} from '../domain/auth.errors.js';
import { type OtpChallenge, OtpChallengeRepository } from '../domain/otp.js';
import { AuthSecrets } from './auth.ports.js';
import { SendOtpUseCase } from './send-otp.use-case.js';
import { SessionIssuer } from './session-issuer.js';
import { VerifyOtpUseCase } from './verify-otp.use-case.js';

const phone = '+9779841234567';
const context = { ipAddress: null, userAgent: null, requestId: null };

describe('SendOtpUseCase', () => {
  const challenges = mockOf<OtpChallengeRepository>();
  const secrets = mockOf<AuthSecrets>();
  const sms = mockOf<SmsSender>();
  const clock = new FixedClock();
  const uow = new FakeUnitOfWork();
  const useCase = new SendOtpUseCase(challenges, secrets, sms, clock, uow);

  beforeEach(() => {
    secrets.newOtpCode.mockReturnValue('123456');
    secrets.hashOtp.mockReturnValue('otp-hash');
  });

  it('stores a hashed code with a 5 minute expiry, burns older codes and texts the code', async () => {
    challenges.sentSince.mockResolvedValue([]);

    await expect(useCase.execute(phone)).resolves.toEqual({
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    });
    expect(challenges.invalidateActive).toHaveBeenCalledWith(phone, 'LOGIN', clock.now());
    expect(challenges.create).toHaveBeenCalledWith({
      phone,
      purpose: 'LOGIN',
      codeHash: 'otp-hash',
      expiresAt: new Date(clock.now().getTime() + 300_000),
    });
    expect(sms.send).toHaveBeenCalledWith(phone, expect.stringContaining('123456'));
  });

  it('rate-limits per phone with a retry hint', async () => {
    challenges.sentSince.mockResolvedValue([new Date(clock.now().getTime() - 10_000)]);
    const error = await useCase.execute(phone).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OtpRateLimitedError);
    expect((error as OtpRateLimitedError).details).toEqual({ retryAfterSeconds: 50 });
    expect(sms.send).not.toHaveBeenCalled();
  });
});

describe('VerifyOtpUseCase', () => {
  const challenges = mockOf<OtpChallengeRepository>();
  const users = mockOf<UserRepository>();
  const secrets = mockOf<AuthSecrets>();
  const sessions = mockOf<SessionIssuer>();
  const clock = new FixedClock();
  const useCase = new VerifyOtpUseCase(
    challenges,
    users,
    secrets,
    sessions,
    clock,
    new FakeUnitOfWork(),
  );
  const challenge: OtpChallenge = {
    id: 'otp-1',
    phone,
    purpose: 'LOGIN',
    codeHash: 'h',
    attempts: 0,
    expiresAt: clock.now(),
    consumedAt: null,
    createdAt: clock.now(),
  };

  beforeEach(() => {
    challenges.findActive.mockResolvedValue(challenge);
    challenges.consumeAttempt.mockResolvedValue(true);
    challenges.markConsumed.mockResolvedValue(true);
    secrets.otpMatches.mockReturnValue(true);
    sessions.start.mockImplementation((user) =>
      Promise.resolve({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, user }),
    );
  });

  it('signs in an existing user and marks the phone verified', async () => {
    users.findByPhone.mockResolvedValue(aUser());
    const session = await useCase.execute({ phone, code: '123456' }, context);
    expect(session.user.id).toBe('user-1');
    expect(challenges.consumeAttempt).toHaveBeenCalledWith('otp-1', 5);
    expect(challenges.markConsumed).toHaveBeenCalledWith('otp-1', clock.now());
    expect(users.markPhoneVerified).toHaveBeenCalledWith('user-1', clock.now());
    expect(users.recordLogin).toHaveBeenCalled();
  });

  it('does not re-verify an already verified phone', async () => {
    users.findByPhone.mockResolvedValue(aUser({ phoneVerifiedAt: new Date() }));
    await useCase.execute({ phone, code: '123456' }, context);
    expect(users.markPhoneVerified).not.toHaveBeenCalled();
  });

  it('creates a verified customer on first sign-in with a name', async () => {
    users.findByPhone.mockResolvedValue(null);
    users.create.mockResolvedValue(aUser({ id: 'new', email: null, passwordHash: null }));
    await useCase.execute({ phone, code: '123456', fullName: 'Nabin Rai' }, context);
    expect(users.create).toHaveBeenCalledWith({
      role: 'CUSTOMER',
      status: 'ACTIVE',
      fullName: 'Nabin Rai',
      email: null,
      phone,
      passwordHash: null,
      phoneVerifiedAt: clock.now(),
    });
  });

  it('asks for a name for new phones without consuming the code', async () => {
    users.findByPhone.mockResolvedValue(null);
    await expect(useCase.execute({ phone, code: '123456' }, context)).rejects.toBeInstanceOf(
      FullNameRequiredError,
    );
    expect(challenges.markConsumed).not.toHaveBeenCalled();
  });

  it.each([
    ['no active code', () => challenges.findActive.mockResolvedValue(null)],
    ['attempts exhausted', () => challenges.consumeAttempt.mockResolvedValue(false)],
    ['wrong code', () => secrets.otpMatches.mockReturnValue(false)],
  ])('rejects when %s', async (_label, arrange) => {
    arrange();
    await expect(useCase.execute({ phone, code: '000000' }, context)).rejects.toBeInstanceOf(
      OtpInvalidError,
    );
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('rejects a code consumed concurrently', async () => {
    users.findByPhone.mockResolvedValue(aUser());
    challenges.markConsumed.mockResolvedValue(false);
    await expect(useCase.execute({ phone, code: '123456' }, context)).rejects.toBeInstanceOf(
      OtpInvalidError,
    );
  });

  it('rejects suspended accounts', async () => {
    users.findByPhone.mockResolvedValue(aUser({ status: 'SUSPENDED' }));
    await expect(useCase.execute({ phone, code: '123456' }, context)).rejects.toBeInstanceOf(
      AccountSuspendedError,
    );
  });
});
