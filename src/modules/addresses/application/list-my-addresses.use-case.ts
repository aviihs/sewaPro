import { Injectable } from '@nestjs/common';
import { type Address, AddressRepository } from '../domain/address.js';

/** At most MAX_ADDRESSES_PER_USER rows, so the list is bounded without pagination. */
@Injectable()
export class ListMyAddressesUseCase {
  constructor(private readonly addresses: AddressRepository) {}

  execute(userId: string): Promise<Address[]> {
    return this.addresses.listByUser(userId);
  }
}
