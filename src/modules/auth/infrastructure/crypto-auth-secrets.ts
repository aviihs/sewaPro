import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { AuthSecrets } from '../application/auth.ports.js';

const REFRESH_TOKEN_BYTES = 48;
const OTP_DIGITS = 6;

/**
 * Refresh tokens: 384 random bits, stored as SHA-256 (high entropy, so a fast
 * hash is sufficient). OTPs: HMAC-SHA256 keyed with a server pepper and bound
 * to the phone, so the 10^6 code space cannot be brute-forced from a DB leak.
 */
export class CryptoAuthSecrets extends AuthSecrets {
  constructor(private readonly otpPepper: string) {
    super();
  }

  newRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  newOtpCode(): string {
    return randomInt(0, 10 ** OTP_DIGITS)
      .toString()
      .padStart(OTP_DIGITS, '0');
  }

  hashOtp(phone: string, code: string): string {
    return createHmac('sha256', this.otpPepper).update(`${phone}:${code}`).digest('hex');
  }

  otpMatches(phone: string, code: string, hash: string): boolean {
    const candidate = Buffer.from(this.hashOtp(phone, code), 'hex');
    const stored = Buffer.from(hash, 'hex');
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  }

  newId(): string {
    return randomUUID();
  }
}
