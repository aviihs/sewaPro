import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import {
  type Address,
  type AddressChanges,
  AddressNotFoundError,
  AddressRepository,
  DefaultAddressRequiredError,
} from '../domain/address.js';

export interface UpdateAddressInput extends AddressChanges {
  readonly isDefault?: boolean;
}

@Injectable()
export class UpdateAddressUseCase {
  constructor(
    private readonly addresses: AddressRepository,
    private readonly uow: UnitOfWork,
  ) {}

  execute(userId: string, addressId: string, input: UpdateAddressInput): Promise<Address> {
    const { isDefault, ...changes } = input;
    return this.uow.run(async () => {
      const current = await this.addresses.findOwned(addressId, userId);
      if (!current) throw new AddressNotFoundError();
      if (isDefault === false && current.isDefault) throw new DefaultAddressRequiredError();

      let updated = current;
      if (Object.keys(changes).length > 0) {
        updated = await this.addresses.update(addressId, changes);
      }
      if (isDefault === true && !current.isDefault) {
        await this.addresses.clearDefault(userId);
        updated = await this.addresses.setDefault(addressId);
      }
      return updated;
    });
  }
}
