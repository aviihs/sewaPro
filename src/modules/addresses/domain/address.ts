import { DomainError } from '../../../common/errors/domain-error.js';

export const MAX_ADDRESSES_PER_USER = 10;

export interface AddressFields {
  readonly label: string;
  readonly line1: string;
  readonly area: string | null;
  readonly city: string;
  readonly district: string | null;
  readonly landmark: string | null;
  readonly latitude: number;
  readonly longitude: number;
}

export interface Address extends AddressFields {
  readonly id: string;
  readonly userId: string;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type AddressChanges = Partial<AddressFields>;

export abstract class AddressRepository {
  /** The address if it exists AND belongs to `userId`; null otherwise (no existence leak). */
  abstract findOwned(id: string, userId: string): Promise<Address | null>;
  /** Default first, then newest. */
  abstract listByUser(userId: string): Promise<Address[]>;
  abstract countByUser(userId: string): Promise<number>;
  abstract create(userId: string, fields: AddressFields, isDefault: boolean): Promise<Address>;
  abstract update(id: string, changes: AddressChanges): Promise<Address>;
  abstract delete(id: string): Promise<void>;
  /** Clears the user's default flag (call before setting a new default, in one transaction). */
  abstract clearDefault(userId: string): Promise<void>;
  abstract setDefault(id: string): Promise<Address>;
  abstract findNewest(userId: string): Promise<Address | null>;
}

export class AddressNotFoundError extends DomainError {
  readonly code = 'ADDRESS_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Address not found');
  }
}

export class AddressLimitReachedError extends DomainError {
  readonly code = 'ADDRESS_LIMIT_REACHED';
  readonly kind = 'BUSINESS_RULE';
  constructor() {
    super(`You can save at most ${MAX_ADDRESSES_PER_USER} addresses`, {
      max: MAX_ADDRESSES_PER_USER,
    });
  }
}

export class DefaultAddressRequiredError extends DomainError {
  readonly code = 'DEFAULT_ADDRESS_REQUIRED';
  readonly kind = 'BUSINESS_RULE';
  constructor() {
    super('Choose another address as default instead of unsetting the current one');
  }
}

export class AddressConflictError extends DomainError {
  readonly code = 'ADDRESS_CONFLICT';
  readonly kind = 'CONFLICT';
  constructor() {
    super('The address was changed concurrently; please retry');
  }
}
