import { Module } from '@nestjs/common';
import { CreateAddressUseCase } from './application/create-address.use-case.js';
import { DeleteAddressUseCase } from './application/delete-address.use-case.js';
import { GetMyAddressUseCase } from './application/get-my-address.use-case.js';
import { ListMyAddressesUseCase } from './application/list-my-addresses.use-case.js';
import { UpdateAddressUseCase } from './application/update-address.use-case.js';
import { AddressRepository } from './domain/address.js';
import { PrismaAddressRepository } from './infrastructure/prisma-address.repository.js';
import { AddressesController } from './presentation/addresses.controller.js';

@Module({
  controllers: [AddressesController],
  providers: [
    { provide: AddressRepository, useClass: PrismaAddressRepository },
    CreateAddressUseCase,
    ListMyAddressesUseCase,
    GetMyAddressUseCase,
    UpdateAddressUseCase,
    DeleteAddressUseCase,
  ],
  exports: [AddressRepository],
})
export class AddressesModule {}
