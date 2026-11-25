import { type Role } from '../../../common/auth/role.js';

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING: 'PENDING',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export interface UserProps {
  readonly id: string;
  readonly role: Role;
  readonly status: UserStatus;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string;
  readonly passwordHash: string | null;
  readonly phoneVerifiedAt: Date | null;
  readonly emailVerifiedAt: Date | null;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Data needed to create an account. */
export interface NewUser {
  readonly role: Role;
  readonly status: UserStatus;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string;
  readonly passwordHash: string | null;
  readonly phoneVerifiedAt: Date | null;
  readonly emailVerifiedAt: Date | null;
}

export interface ProfileChanges {
  readonly fullName?: string;
  readonly email?: string | null;
  /** Reset to null when the email changes: the new address must be verified again. */
  readonly emailVerifiedAt?: Date | null;
}

/** An account (customer, provider or admin). Immutable: changes return new instances. */
export class User implements UserProps {
  readonly id: string;
  readonly role: Role;
  readonly status: UserStatus;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string;
  readonly passwordHash: string | null;
  readonly phoneVerifiedAt: Date | null;
  readonly emailVerifiedAt: Date | null;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: UserProps) {
    Object.assign(this, props);
  }

  static restore(props: UserProps): User {
    return new User(props);
  }

  /** Suspended accounts cannot start sessions; PENDING providers can (to finish onboarding). */
  get canLogin(): boolean {
    return this.status !== UserStatus.SUSPENDED;
  }

  get isPhoneVerified(): boolean {
    return this.phoneVerifiedAt !== null;
  }

  /** Password sign-in needs a verified email (D-088). */
  get isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null;
  }
}
