import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { AddressNotFoundError, AddressRepository } from '../domain/address.js';

/**
 * Deletes an address. If it was the default, the newest remaining address
 * becomes the default. Bookings keep their own address snapshot.
 */
@Injectable()
export class DeleteAddressUseCase {
  constructor(
    private readonly addresses: AddressRepository,
    private readonly uow: UnitOfWork,
  ) {}

  execute(userId: string, addressId: string): Promise<void> {
    return this.uow.run(async () => {
      const current = await this.addresses.findOwned(addressId, userId);
      if (!current) throw new AddressNotFoundError();
      await this.addresses.delete(addressId);
      if (!current.isDefault) return;
      const next = await this.addresses.findNewest(userId);
      if (next) await this.addresses.setDefault(next.id);
    });
  }
}
