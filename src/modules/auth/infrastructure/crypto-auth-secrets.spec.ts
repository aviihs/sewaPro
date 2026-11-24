import { describe, expect, it } from 'vitest';
import { CryptoAuthSecrets } from './crypto-auth-secrets.js';

describe('CryptoAuthSecrets', () => {
  const secrets = new CryptoAuthSecrets('p'.repeat(32));

  it('creates unique url-safe refresh tokens and stable hashes', () => {
    const a = secrets.newRefreshToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(a).not.toBe(secrets.newRefreshToken());
    expect(secrets.hashRefreshToken(a)).toBe(secrets.hashRefreshToken(a));
    expect(secrets.hashRefreshToken(a)).toHaveLength(64);
  });

  it('creates 6-digit codes', () => {
    for (let i = 0; i < 50; i += 1) expect(secrets.newOtpCode()).toMatch(/^\d{6}$/);
  });

  it('binds OTP hashes to the phone and pepper', () => {
    const hash = secrets.hashOtp('+9779841234567', '123456');
    expect(secrets.otpMatches('+9779841234567', '123456', hash)).toBe(true);
    expect(secrets.otpMatches('+9779841234567', '123457', hash)).toBe(false);
    expect(secrets.otpMatches('+9779800000000', '123456', hash)).toBe(false);
    expect(new CryptoAuthSecrets('q'.repeat(32)).otpMatches('+9779841234567', '123456', hash)).toBe(
      false,
    );
    expect(secrets.otpMatches('+9779841234567', '123456', 'abcd')).toBe(false);
  });

  it('creates uuids', () => {
    expect(secrets.newId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
