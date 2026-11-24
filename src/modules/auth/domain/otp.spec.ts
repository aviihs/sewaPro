import { describe, expect, it } from 'vitest';
import { otpSendRetryAfter } from './otp.js';
import { isRefreshTokenExpired } from './refresh-token.js';

const now = new Date('2030-01-01T10:00:00Z');
const secondsAgo = (s: number): Date => new Date(now.getTime() - s * 1000);

describe('otpSendRetryAfter', () => {
  it('allows the first send', () => {
    expect(otpSendRetryAfter([], now)).toBe(0);
  });

  it('enforces the 60 second cooldown', () => {
    expect(otpSendRetryAfter([secondsAgo(20)], now)).toBe(40);
    expect(otpSendRetryAfter([secondsAgo(60)], now)).toBe(0);
  });

  it('allows at most 3 sends per 15 minutes', () => {
    const sends = [secondsAgo(800), secondsAgo(500), secondsAgo(200)];
    expect(otpSendRetryAfter(sends, now)).toBe(100);
  });

  it('ignores sends outside the window', () => {
    expect(otpSendRetryAfter([secondsAgo(2000), secondsAgo(1500), secondsAgo(950)], now)).toBe(0);
  });
});

describe('isRefreshTokenExpired', () => {
  const token = { id: 't', userId: 'u', familyId: 'f', revokedAt: null, expiresAt: now };
  it('is expired at and after expiry', () => {
    expect(isRefreshTokenExpired(token, now)).toBe(true);
    expect(isRefreshTokenExpired(token, secondsAgo(1))).toBe(false);
  });
});
