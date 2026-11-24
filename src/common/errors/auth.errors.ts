import { DomainError } from './domain-error.js';

export class AuthenticationRequiredError extends DomainError {
  readonly code = 'AUTH_REQUIRED';
  readonly kind = 'UNAUTHORIZED';
  constructor() {
    super('Authentication is required');
  }
}

export class InvalidAccessTokenError extends DomainError {
  readonly code = 'ACCESS_TOKEN_INVALID';
  readonly kind = 'UNAUTHORIZED';
  constructor() {
    super('Access token is invalid or expired');
  }
}

export class InsufficientRoleError extends DomainError {
  readonly code = 'FORBIDDEN_ROLE';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('You do not have permission to perform this action');
  }
}

export class AccountSuspendedError extends DomainError {
  readonly code = 'ACCOUNT_SUSPENDED';
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('This account is suspended');
  }
}
