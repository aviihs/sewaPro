import { Injectable } from '@nestjs/common';
import { type Address as AddressRow } from '../../../infrastructure/prisma/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/prisma/prisma-errors.js';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type Address,
  type AddressChanges,
  AddressConflictError,
  type AddressFields,
  AddressRepository,
} from '../domain/address.js';

const toAddress = (row: AddressRow): Address => ({
  id: row.id,
  userId: row.userId,
  label: row.label,
  line1: row.line1,
  area: row.area,
  city: row.city,
  district: row.district,
  landmark: row.landmark,
  latitude: row.latitude,
  longitude: row.longitude,
  isDefault: row.isDefault,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

@Injectable()
export class PrismaAddressRepository extends AddressRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client.address;
  }

  async findOwned(id: string, userId: string): Promise<Address | null> {
    const row = await this.db.findFirst({ where: { id, userId } });
    return row ? toAddress(row) : null;
  }

  async listByUser(userId: string): Promise<Address[]> {
    const rows = await this.db.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toAddress);
  }

  countByUser(userId: string): Promise<number> {
    return this.db.count({ where: { userId } });
  }

  async create(userId: string, fields: AddressFields, isDefault: boolean): Promise<Address> {
    try {
      return toAddress(await this.db.create({ data: { ...fields, userId, isDefault } }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new AddressConflictError();
      throw error;
    }
  }

  async update(id: string, changes: AddressChanges): Promise<Address> {
    return toAddress(await this.db.update({ where: { id }, data: changes }));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete({ where: { id } });
  }

  async clearDefault(userId: string): Promise<void> {
    await this.db.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  }

  async setDefault(id: string): Promise<Address> {
    try {
      return toAddress(await this.db.update({ where: { id }, data: { isDefault: true } }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new AddressConflictError();
      throw error;
    }
  }

  async findNewest(userId: string): Promise<Address | null> {
    const row = await this.db.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return row ? toAddress(row) : null;
  }
}
