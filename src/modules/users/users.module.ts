import { Module } from '@nestjs/common';
import { GetMyProfileUseCase } from './application/get-my-profile.use-case.js';
import { UpdateMyProfileUseCase } from './application/update-my-profile.use-case.js';
import { UserRepository } from './domain/user.repository.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
import { UsersController } from './presentation/users.controller.js';

@Module({
  controllers: [UsersController],
  providers: [
    { provide: UserRepository, useClass: PrismaUserRepository },
    GetMyProfileUseCase,
    UpdateMyProfileUseCase,
  ],
  exports: [UserRepository, GetMyProfileUseCase],
})
export class UsersModule {}
