import { beforeEach, describe, expect, it } from 'vitest';
import { FakeUnitOfWork, FixedClock, mockOf } from '../../../../test/unit/mock.js';
import { EmailSender } from '../../../common/ports/messaging.port.js';
import { OtpInvalidError } from '../domain/auth.errors.js';
import { type OtpChallenge, OtpChallengeRepository } from '../domain/otp.js';
import { AuthSecrets } from './auth.ports.js';
import { EmailCodes } from './email-codes.js';

const email = 'aarati@example.com';

describe('EmailCodes', () => {
  const challenges = mockOf<OtpChallengeRepository>();
  const secrets = mockOf<AuthSecrets>();
  const sender = mockOf<EmailSender>();
  const clock = new FixedClock();
  const uow = new FakeUnitOfWork();
  const codes = new EmailCodes(challenges, secrets, sender, clock, uow);
  const challenge: OtpChallenge = {
    id: 'otp-1',
    recipient: email,
    purpose: 'EMAIL_VERIFICATION',
    codeHash: 'otp-hash',
    attempts: 0,
    expiresAt: new Date(clock.now().getTime() + 600_000),
    consumedAt: null,
    createdAt: clock.now(),
  };

  beforeEach(() => {
    secrets.newOtpCode.mockReturnValue('123456');
    secrets.hashOtp.mockReturnValue('otp-hash');
  });

  describe('send', () => {
    it('stores a hashed code for 10 minutes, burns older codes and emails the code', async () => {
      challenges.sentSince.mockResolvedValue([]);

      await expect(codes.send(email, 'EMAIL_VERIFICATION', 'Aarati')).resolves.toBe(true);
      expect(challenges.invalidateActive).toHaveBeenCalledWith(
        email,
        'EMAIL_VERIFICATION',
        clock.now(),
      );
      expect(challenges.create).toHaveBeenCalledWith({
        recipient: email,
        purpose: 'EMAIL_VERIFICATION',
        codeHash: 'otp-hash',
        expiresAt: new Date(clock.now().getTime() + 600_000),
      });
      expect(uow.runs).toBeGreaterThan(0);
      expect(sender.send).toHaveBeenCalledWith(
        email,
        'Verify your SewaPro email',
        expect.stringMatching(/Hi Aarati,[\s\S]*123456[\s\S]*10 minutes/),
      );
    });

    it('uses a reset subject for password reset codes', async () => {
      challenges.sentSince.mockResolvedValue([]);
      await codes.send(email, 'PASSWORD_RESET', 'Aarati');
      expect(sender.send).toHaveBeenCalledWith(
        email,
        'Reset your SewaPro password',
        expect.stringContaining('reset your password: 123456'),
      );
    });

    it('drops the send silently inside the cooldown', async () => {
      challenges.sentSince.mockResolvedValue([new Date(clock.now().getTime() - 10_000)]);
      await expect(codes.send(email, 'EMAIL_VERIFICATION', 'Aarati')).resolves.toBe(false);
      expect(challenges.create).not.toHaveBeenCalled();
      expect(sender.send).not.toHaveBeenCalled();
    });
  });

  describe('check', () => {
    it('spends an attempt and returns the challenge for a correct code', async () => {
      challenges.findActive.mockResolvedValue(challenge);
      challenges.consumeAttempt.mockResolvedValue(true);
      secrets.otpMatches.mockReturnValue(true);

      await expect(codes.check(email, 'EMAIL_VERIFICATION', '123456')).resolves.toBe('otp-1');
      expect(challenges.consumeAttempt).toHaveBeenCalledWith('otp-1', 5);
      expect(secrets.otpMatches).toHaveBeenCalledWith(email, '123456', 'otp-hash');
    });

    it('rejects missing, exhausted and wrong codes the same way', async () => {
      challenges.findActive.mockResolvedValueOnce(null);
      await expect(codes.check(email, 'EMAIL_VERIFICATION', '1')).rejects.toBeInstanceOf(
        OtpInvalidError,
      );

      challenges.findActive.mockResolvedValue(challenge);
      challenges.consumeAttempt.mockResolvedValueOnce(false);
      await expect(codes.check(email, 'EMAIL_VERIFICATION', '1')).rejects.toBeInstanceOf(
        OtpInvalidError,
      );

      challenges.consumeAttempt.mockResolvedValue(true);
      secrets.otpMatches.mockReturnValue(false);
      await expect(codes.check(email, 'EMAIL_VERIFICATION', '1')).rejects.toBeInstanceOf(
        OtpInvalidError,
      );
    });
  });

  it('consume fails when the code was used concurrently', async () => {
    challenges.markConsumed.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(codes.consume('otp-1', clock.now())).resolves.toBeUndefined();
    await expect(codes.consume('otp-1', clock.now())).rejects.toBeInstanceOf(OtpInvalidError);
  });
});
