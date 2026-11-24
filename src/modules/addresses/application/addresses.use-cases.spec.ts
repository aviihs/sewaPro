import { beforeEach, describe, expect, it } from 'vitest';
import { FakeUnitOfWork, mockOf } from '../../../../test/unit/mock.js';
import {
  type Address,
  AddressLimitReachedError,
  AddressNotFoundError,
  AddressRepository,
  DefaultAddressRequiredError,
} from '../domain/address.js';
import { CreateAddressUseCase } from './create-address.use-case.js';
import { DeleteAddressUseCase } from './delete-address.use-case.js';
import { GetMyAddressUseCase } from './get-my-address.use-case.js';
import { ListMyAddressesUseCase } from './list-my-addresses.use-case.js';
import { UpdateAddressUseCase } from './update-address.use-case.js';

const fields = {
  label: 'Home',
  line1: 'Ward 4',
  area: null,
  city: 'Kathmandu',
  district: null,
  landmark: null,
  latitude: 27.7,
  longitude: 85.3,
};
const anAddress = (overrides: Partial<Address> = {}): Address => ({
  ...fields,
  id: 'addr-1',
  userId: 'user-1',
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('addresses use cases', () => {
  const addresses = mockOf<AddressRepository>();
  const uow = new FakeUnitOfWork();

  beforeEach(() => {
    addresses.findOwned.mockResolvedValue(anAddress());
    addresses.create.mockResolvedValue(anAddress());
    addresses.update.mockResolvedValue(anAddress({ label: 'Office' }));
    addresses.setDefault.mockResolvedValue(anAddress({ isDefault: true }));
  });

  describe('CreateAddressUseCase', () => {
    const useCase = new CreateAddressUseCase(addresses, uow);

    it('makes the first address the default', async () => {
      addresses.countByUser.mockResolvedValue(0);
      await useCase.execute('user-1', fields);
      expect(addresses.clearDefault).toHaveBeenCalledWith('user-1');
      expect(addresses.create).toHaveBeenCalledWith('user-1', fields, true);
    });

    it('keeps the existing default unless asked', async () => {
      addresses.countByUser.mockResolvedValue(2);
      await useCase.execute('user-1', fields);
      expect(addresses.clearDefault).not.toHaveBeenCalled();
      expect(addresses.create).toHaveBeenCalledWith('user-1', fields, false);

      await useCase.execute('user-1', fields, true);
      expect(addresses.clearDefault).toHaveBeenCalledWith('user-1');
    });

    it('enforces the 10 address limit', async () => {
      addresses.countByUser.mockResolvedValue(10);
      await expect(useCase.execute('user-1', fields)).rejects.toBeInstanceOf(
        AddressLimitReachedError,
      );
    });
  });

  it('ListMyAddressesUseCase lists the user addresses', async () => {
    addresses.listByUser.mockResolvedValue([anAddress()]);
    await expect(new ListMyAddressesUseCase(addresses).execute('user-1')).resolves.toHaveLength(1);
  });

  describe('GetMyAddressUseCase', () => {
    it('returns owned addresses and hides others', async () => {
      const useCase = new GetMyAddressUseCase(addresses);
      await expect(useCase.execute('user-1', 'addr-1')).resolves.toMatchObject({ id: 'addr-1' });
      addresses.findOwned.mockResolvedValue(null);
      await expect(useCase.execute('user-2', 'addr-1')).rejects.toBeInstanceOf(
        AddressNotFoundError,
      );
    });
  });

  describe('UpdateAddressUseCase', () => {
    const useCase = new UpdateAddressUseCase(addresses, uow);

    it('updates fields', async () => {
      const result = await useCase.execute('user-1', 'addr-1', { label: 'Office' });
      expect(result.label).toBe('Office');
      expect(addresses.setDefault).not.toHaveBeenCalled();
    });

    it('moves the default flag', async () => {
      const result = await useCase.execute('user-1', 'addr-1', { isDefault: true });
      expect(addresses.update).not.toHaveBeenCalled();
      expect(addresses.clearDefault).toHaveBeenCalledWith('user-1');
      expect(result.isDefault).toBe(true);
    });

    it('refuses to unset the current default', async () => {
      addresses.findOwned.mockResolvedValue(anAddress({ isDefault: true }));
      await expect(
        useCase.execute('user-1', 'addr-1', { isDefault: false }),
      ).rejects.toBeInstanceOf(DefaultAddressRequiredError);
    });

    it('hides addresses of other users', async () => {
      addresses.findOwned.mockResolvedValue(null);
      await expect(useCase.execute('user-2', 'addr-1', { label: 'x' })).rejects.toBeInstanceOf(
        AddressNotFoundError,
      );
    });
  });

  describe('DeleteAddressUseCase', () => {
    const useCase = new DeleteAddressUseCase(addresses, uow);

    it('deletes a non-default address', async () => {
      await useCase.execute('user-1', 'addr-1');
      expect(addresses.delete).toHaveBeenCalledWith('addr-1');
      expect(addresses.findNewest).not.toHaveBeenCalled();
    });

    it('promotes the newest remaining address when the default is deleted', async () => {
      addresses.findOwned.mockResolvedValue(anAddress({ isDefault: true }));
      addresses.findNewest
        .mockResolvedValueOnce(anAddress({ id: 'addr-2' }))
        .mockResolvedValueOnce(null);
      await useCase.execute('user-1', 'addr-1');
      expect(addresses.setDefault).toHaveBeenCalledWith('addr-2');
      await useCase.execute('user-1', 'addr-1');
      expect(addresses.setDefault).toHaveBeenCalledTimes(1);
    });

    it('hides addresses of other users', async () => {
      addresses.findOwned.mockResolvedValue(null);
      await expect(useCase.execute('user-2', 'addr-1')).rejects.toBeInstanceOf(
        AddressNotFoundError,
      );
    });
  });
});
