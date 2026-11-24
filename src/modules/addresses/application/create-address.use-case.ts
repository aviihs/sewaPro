import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import {
  type Address,
  type AddressFields,
  AddressLimitReachedError,
  AddressRepository,
  MAX_ADDRESSES_PER_USER,
} from '../domain/address.js';

/** The first address is always the default; `isDefault: true` moves the default here. */
@Injectable()
export class CreateAddressUseCase {
  constructor(
    private readonly addresses: AddressRepository,
    private readonly uow: UnitOfWork,
  ) {}

  execute(userId: string, fields: AddressFields, makeDefault = false): Promise<Address> {
    return this.uow.run(async () => {
      const count = await this.addresses.countByUser(userId);
      if (count >= MAX_ADDRESSES_PER_USER) throw new AddressLimitReachedError();
      const isDefault = count === 0 || makeDefault;
      if (isDefault) await this.addresses.clearDefault(userId);
      return this.addresses.create(userId, fields, isDefault);
    });
  }
}
