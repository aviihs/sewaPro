import { User, type UserProps } from '../../../src/modules/users/domain/user.js';

export const aUser = (overrides: Partial<UserProps> = {}): User =>
  User.restore({
    id: 'user-1',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    fullName: 'Aarati Sharma',
    email: 'aarati@example.com',
    phone: '+9779841234567',
    passwordHash: 'hash',
    phoneVerifiedAt: null,
    emailVerifiedAt: new Date('2030-01-01T00:00:00Z'),
    lastLoginAt: null,
    createdAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date('2030-01-01T00:00:00Z'),
    ...overrides,
  });
