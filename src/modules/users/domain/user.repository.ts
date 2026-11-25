import { type Role } from '../../../common/auth/role.js';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import { type NewUser, type ProfileChanges, type User, type UserStatus } from './user.js';

export interface UserListFilter {
  readonly role?: Role;
  readonly status?: UserStatus;
  /** Case-insensitive match on name, email or phone. */
  readonly search?: string;
}

/** Persistence port for accounts. Soft-deleted users are never returned. */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findByPhone(phone: string): Promise<User | null>;
  /** @throws UserAlreadyExistsError when the email or phone is taken. */
  abstract create(user: NewUser): Promise<User>;
  /** @throws EmailAlreadyInUseError when the new email belongs to another account. */
  abstract updateProfile(id: string, changes: ProfileChanges): Promise<User>;
  abstract recordLogin(id: string, at: Date): Promise<void>;
  abstract markPhoneVerified(id: string, at: Date): Promise<void>;
  abstract markEmailVerified(id: string, at: Date): Promise<User>;
  abstract updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  abstract setStatus(id: string, status: UserStatus): Promise<User>;
  abstract list(filter: UserListFilter, page: PageRequest): Promise<PaginatedResult<User>>;
}
