import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../common/ports/unit-of-work.port.js';
import { type Prisma } from './generated/client.js';
import { PrismaService } from './prisma.service.js';

/**
 * Unit of Work backed by `prisma.$transaction` and AsyncLocalStorage.
 * Repositories read `client`, which is the active transaction when called
 * inside `run()`, otherwise the shared client. Use cases only see `UnitOfWork`.
 */
@Injectable()
export class PrismaTransactionHost extends UnitOfWork {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  get client(): Prisma.TransactionClient {
    return this.storage.getStore() ?? this.prisma;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return work();
    return this.prisma.$transaction((tx) => this.storage.run(tx, work), {
      maxWait: 5_000,
      timeout: 15_000,
    });
  }
}
