import { Injectable } from '@nestjs/common';
import { PaginatedResult, type PageRequest, toOffset } from '../../../common/utils/pagination.js';
import {
  type Prisma,
  type User as UserRow,
} from '../../../infrastructure/prisma/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import { type NewUser, type ProfileChanges, User, type UserStatus } from '../domain/user.js';
import { type UserListFilter, UserRepository } from '../domain/user.repository.js';
import { EmailAlreadyInUseError, UserAlreadyExistsError } from '../domain/users.errors.js';

export function toUser(row: UserRow): User {
  return User.restore({
    id: row.id,
    role: row.role,
    status: row.status,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    passwordHash: row.passwordHash,
    phoneVerifiedAt: row.phoneVerifiedAt,
    emailVerifiedAt: row.emailVerifiedAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.user.findFirst({ where: { id, deletedAt: null } });
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.user.findFirst({ where: { email, deletedAt: null } });
    return row ? toUser(row) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const row = await this.db.user.findFirst({ where: { phone, deletedAt: null } });
    return row ? toUser(row) : null;
  }

  async create(user: NewUser): Promise<User> {
    try {
      return toUser(await this.db.user.create({ data: user }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserAlreadyExistsError();
      throw error;
    }
  }

  async updateProfile(id: string, changes: ProfileChanges): Promise<User> {
    try {
      return toUser(await this.db.user.update({ where: { id }, data: changes }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailAlreadyInUseError();
      throw error;
    }
  }

  async recordLogin(id: string, at: Date): Promise<void> {
    await this.db.user.update({ where: { id }, data: { lastLoginAt: at } });
  }

  async markPhoneVerified(id: string, at: Date): Promise<void> {
    await this.db.user.update({ where: { id }, data: { phoneVerifiedAt: at } });
  }

  async markEmailVerified(id: string, at: Date): Promise<User> {
    return toUser(await this.db.user.update({ where: { id }, data: { emailVerifiedAt: at } }));
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db.user.update({ where: { id }, data: { passwordHash } });
  }

  async setStatus(id: string, status: UserStatus): Promise<User> {
    return toUser(await this.db.user.update({ where: { id }, data: { status } }));
  }

  async list(filter: UserListFilter, page: PageRequest): Promise<PaginatedResult<User>> {
    const contains = filter.search;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: filter.role,
      status: filter.status,
      ...(contains
        ? {
            OR: [
              { fullName: { contains, mode: 'insensitive' } },
              { email: { contains, mode: 'insensitive' } },
              { phone: { contains } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.user.findMany({ where, orderBy: { createdAt: 'desc' }, ...toOffset(page) }),
      this.db.user.count({ where }),
    ]);
    return PaginatedResult.of(rows.map(toUser), total, page);
  }
}
