import { Injectable } from '@nestjs/common';
import { type Address, AddressNotFoundError, AddressRepository } from '../domain/address.js';

@Injectable()
export class GetMyAddressUseCase {
  constructor(private readonly addresses: AddressRepository) {}

  async execute(userId: string, addressId: string): Promise<Address> {
    const address = await this.addresses.findOwned(addressId, userId);
    if (!address) throw new AddressNotFoundError();
    return address;
  }
}
