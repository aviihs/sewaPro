import { beforeEach, describe, expect, it } from 'vitest';
import { aUser } from '../../../../test/unit/fixtures/users.js';
import { mockOf } from '../../../../test/unit/mock.js';
import { UserRepository } from '../domain/user.repository.js';
import { EmailAlreadyInUseError, UserNotFoundError } from '../domain/users.errors.js';
import { GetMyProfileUseCase } from './get-my-profile.use-case.js';
import { UpdateMyProfileUseCase } from './update-my-profile.use-case.js';

describe('users use cases', () => {
  const users = mockOf<UserRepository>();

  beforeEach(() => {
    users.findById.mockResolvedValue(aUser());
  });

  describe('GetMyProfileUseCase', () => {
    it('returns the user', async () => {
      const user = await new GetMyProfileUseCase(users).execute('user-1');
      expect(user.fullName).toBe('Aarati Sharma');
      expect(user.canLogin).toBe(true);
      expect(user.isPhoneVerified).toBe(false);
    });

    it('fails when the user is gone', async () => {
      users.findById.mockResolvedValue(null);
      await expect(new GetMyProfileUseCase(users).execute('x')).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });
  });

  describe('UpdateMyProfileUseCase', () => {
    const useCase = new UpdateMyProfileUseCase(users);

    it('updates the name without an email check', async () => {
      users.updateProfile.mockResolvedValue(aUser({ fullName: 'New Name' }));
      const user = await useCase.execute('user-1', { fullName: 'New Name' });
      expect(user.fullName).toBe('New Name');
      expect(users.findByEmail).not.toHaveBeenCalled();
    });

    it('allows a free email and keeping the same one', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.updateProfile.mockResolvedValue(aUser({ email: 'new@example.com' }));
      await useCase.execute('user-1', { email: 'new@example.com' });
      await useCase.execute('user-1', { email: 'aarati@example.com' });
      expect(users.findByEmail).toHaveBeenCalledTimes(1);
      expect(users.updateProfile).toHaveBeenNthCalledWith(1, 'user-1', {
        email: 'new@example.com',
        emailVerifiedAt: null,
      });
      expect(users.updateProfile).toHaveBeenNthCalledWith(2, 'user-1', {
        email: 'aarati@example.com',
      });
    });

    it('rejects an email owned by someone else', async () => {
      users.findByEmail.mockResolvedValue(aUser({ id: 'other' }));
      await expect(
        useCase.execute('user-1', { email: 'taken@example.com' }),
      ).rejects.toBeInstanceOf(EmailAlreadyInUseError);
    });

    it('fails when the user is gone', async () => {
      users.findById.mockResolvedValue(null);
      await expect(useCase.execute('x', { fullName: 'A' })).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });
  });
});
