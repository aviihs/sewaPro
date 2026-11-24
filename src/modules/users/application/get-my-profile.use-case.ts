import { Injectable } from '@nestjs/common';
import { type User } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
import { UserNotFoundError } from '../domain/users.errors.js';

@Injectable()
export class GetMyProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new UserNotFoundError();
    return user;
  }
}
