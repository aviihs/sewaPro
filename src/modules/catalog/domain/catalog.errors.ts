import { DomainError } from '../../../common/errors/domain-error.js';

export class CategoryNotFoundError extends DomainError {
  readonly code = 'CATEGORY_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Category not found');
  }
}

export class ServiceNotFoundError extends DomainError {
  readonly code = 'SERVICE_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Service not found');
  }
}

export class CategoryNameTakenError extends DomainError {
  readonly code = 'CATEGORY_NAME_TAKEN';
  readonly kind = 'CONFLICT';
  constructor() {
    super('A category with this name already exists');
  }
}

export class ServiceNameTakenError extends DomainError {
  readonly code = 'SERVICE_NAME_TAKEN';
  readonly kind = 'CONFLICT';
  constructor() {
    super('A service with this name already exists in the category');
  }
}

export class SlugTakenError extends DomainError {
  readonly code = 'SLUG_TAKEN';
  readonly kind = 'CONFLICT';
  constructor(slug: string) {
    super('This slug is already used', { slug });
  }
}
