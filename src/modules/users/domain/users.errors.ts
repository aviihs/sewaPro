import { DomainError } from '../../../common/errors/domain-error.js';

export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('User not found');
  }
}

/** Registration conflict. Deliberately does not say whether email or phone collided. */
export class UserAlreadyExistsError extends DomainError {
  readonly code = 'ACCOUNT_ALREADY_EXISTS';
  readonly kind = 'CONFLICT';
  constructor() {
    super('An account with this email or phone already exists');
  }
}

export class EmailAlreadyInUseError extends DomainError {
  readonly code = 'EMAIL_ALREADY_IN_USE';
  readonly kind = 'CONFLICT';
  constructor() {
    super('This email is already used by another account');
  }
}

export class CannotChangeOwnStatusError extends DomainError {
  readonly code = 'CANNOT_CHANGE_OWN_STATUS';
  readonly kind = 'BUSINESS_RULE';
  constructor() {
    super('Admins cannot suspend or reactivate themselves');
  }
}

export class InvalidStatusChangeError extends DomainError {
  readonly code = 'INVALID_USER_STATUS_CHANGE';
  readonly kind = 'CONFLICT';
  constructor(from: string, to: string) {
    super(`Cannot change user status from ${from} to ${to}`, { from, to });
  }
}
