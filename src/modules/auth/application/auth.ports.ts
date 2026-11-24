import { type AuthenticatedUser } from '../../../common/auth/role.js';

/** Signs and verifies short-lived access tokens (JWT in production). */
export abstract class AccessTokenService {
  abstract sign(user: AuthenticatedUser): Promise<string>;
  /** Returns the subject for a valid, unexpired token; null otherwise (never throws). */
  abstract verify(token: string): Promise<AuthenticatedUser | null>;
}

/** Randomness and keyed hashing for refresh tokens and OTP codes. */
export abstract class AuthSecrets {
  /** High-entropy opaque refresh token. */
  abstract newRefreshToken(): string;
  abstract hashRefreshToken(token: string): string;
  /** Uniformly random 6-digit code. */
  abstract newOtpCode(): string;
  /** HMAC bound to the phone, so a leaked hash cannot be brute-forced offline. */
  abstract hashOtp(phone: string, code: string): string;
  /** Constant-time comparison of a candidate code against a stored hash. */
  abstract otpMatches(phone: string, code: string, hash: string): boolean;
  abstract newId(): string;
}

export abstract class AuthSettings {
  abstract readonly accessTtlSeconds: number;
  abstract readonly refreshTtlDays: number;
}
