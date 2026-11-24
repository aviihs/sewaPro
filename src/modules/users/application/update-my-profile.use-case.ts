import { Injectable } from '@nestjs/common';
import { type ProfileChanges, type User } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
import { EmailAlreadyInUseError, UserNotFoundError } from '../domain/users.errors.js';

/** Updates name/email. Phone changes need OTP verification and are not done here. */
@Injectable()
export class UpdateMyProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string, changes: ProfileChanges): Promise<User> {
    const current = await this.users.findById(userId);
    if (!current) throw new UserNotFoundError();

    if (changes.email && changes.email !== current.email) {
      const owner = await this.users.findByEmail(changes.email);
      if (owner && owner.id !== userId) throw new EmailAlreadyInUseError();
    }
    return this.users.updateProfile(userId, changes);
  }
}
