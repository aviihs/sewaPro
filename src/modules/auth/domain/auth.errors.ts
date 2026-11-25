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

/** Correct password, but the email has not been confirmed with a code yet. */
export class EmailNotVerifiedError extends DomainError {
  readonly code = 'EMAIL_NOT_VERIFIED';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('Verify your email with the code we sent before signing in');
  }
}

export class CurrentPasswordIncorrectError extends DomainError {
  readonly code = 'CURRENT_PASSWORD_INCORRECT';
  readonly kind = 'BUSINESS_RULE';
  constructor() {
    super('The current password is incorrect');
  }
}
