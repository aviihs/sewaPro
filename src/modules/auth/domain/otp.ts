export const OtpPurpose = { LOGIN: 'LOGIN' } as const;
export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];

export const OTP_POLICY = {
  /** Code lifetime. */
  ttlSeconds: 300,
  /** Wrong guesses allowed per code before it is burned. */
  maxAttempts: 5,
  /** Minimum gap between two codes for the same phone. */
  resendCooldownSeconds: 60,
  /** At most `maxSendsPerWindow` codes per phone per window. */
  maxSendsPerWindow: 3,
  sendWindowSeconds: 900,
} as const;

/** A one-time code sent to a phone. Only an HMAC of the code is stored. */
export interface OtpChallenge {
  readonly id: string;
  readonly phone: string;
  readonly purpose: OtpPurpose;
  readonly codeHash: string;
  readonly attempts: number;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly createdAt: Date;
}

export interface NewOtpChallenge {
  readonly phone: string;
  readonly purpose: OtpPurpose;
  readonly codeHash: string;
  readonly expiresAt: Date;
}

/** Seconds the caller must wait before another code may be sent; 0 when allowed. */
export function otpSendRetryAfter(recentSendTimes: readonly Date[], now: Date): number {
  const nowMs = now.getTime();
  const windowStart = nowMs - OTP_POLICY.sendWindowSeconds * 1000;
  const inWindow = recentSendTimes
    .map((d) => d.getTime())
    .filter((t) => t > windowStart)
    .sort((a, b) => a - b);

  const latest = inWindow.at(-1);
  const cooldownLeft =
    latest === undefined ? 0 : latest + OTP_POLICY.resendCooldownSeconds * 1000 - nowMs;

  let windowLeft = 0;
  if (inWindow.length >= OTP_POLICY.maxSendsPerWindow) {
    const oldestCounted = inWindow[inWindow.length - OTP_POLICY.maxSendsPerWindow] ?? nowMs;
    windowLeft = oldestCounted + OTP_POLICY.sendWindowSeconds * 1000 - nowMs;
  }
  return Math.max(0, Math.ceil(Math.max(cooldownLeft, windowLeft) / 1000));
}

export abstract class OtpChallengeRepository {
  abstract create(challenge: NewOtpChallenge): Promise<OtpChallenge>;
  /** Send times for the phone since `since`, used for per-phone rate limiting. */
  abstract sentSince(phone: string, purpose: OtpPurpose, since: Date): Promise<Date[]>;
  /** Newest code that is unconsumed, unexpired and has attempts left. */
  abstract findActive(phone: string, purpose: OtpPurpose, now: Date): Promise<OtpChallenge | null>;
  /**
   * Atomically spends one attempt. Returns false when none are left, so
   * parallel guesses can never exceed `OTP_POLICY.maxAttempts`.
   */
  abstract consumeAttempt(id: string, maxAttempts: number): Promise<boolean>;
  /** Marks the code used; false if it was already used concurrently. */
  abstract markConsumed(id: string, at: Date): Promise<boolean>;
  /** Burns every outstanding code for the phone (called when a new code is issued). */
  abstract invalidateActive(phone: string, purpose: OtpPurpose, at: Date): Promise<void>;
}
