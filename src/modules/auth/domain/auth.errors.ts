import { DomainError } from '../../../common/errors/domain-error.js';

/** Generic on purpose: never reveals whether the email exists or the password was wrong. */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly kind = 'UNAUTHORIZED';
  constructor() {
    super('Invalid email or password');
  }
}

export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'REFRESH_TOKEN_INVALID';
  readonly kind = 'UNAUTHORIZED';
  constructor() {
    super('Refresh token is invalid or expired');
  }
}

/** A rotated token was presented again: the whole session family has been revoked. */
export class RefreshTokenReuseError extends DomainError {
  readonly code = 'REFRESH_TOKEN_REUSED';
  readonly kind = 'UNAUTHORIZED';
  constructor() {
    super('Refresh token reuse detected; please sign in again');
  }
}

export class OtpInvalidError extends DomainError {
  readonly code = 'OTP_INVALID';
  readonly kind = 'UNAUTHORIZED';
  constructor() {
    super('The code is invalid or has expired');
  }
}

export class OtpRateLimitedError extends DomainError {
  readonly code = 'OTP_RATE_LIMITED';
  readonly kind = 'RATE_LIMITED';
  constructor(retryAfterSeconds: number) {
    super('Too many codes requested for this phone; try again later', { retryAfterSeconds });
  }
}

/** First OTP login for a new phone: a name is needed to create the account. */
export class FullNameRequiredError extends DomainError {
  readonly code = 'FULL_NAME_REQUIRED';
  readonly kind = 'BUSINESS_RULE';
  constructor() {
    super('No account exists for this phone yet; provide fullName to create one');
  }
}
