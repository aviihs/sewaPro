import { Global, Module } from '@nestjs/common';
import { UnitOfWork } from '../../common/ports/unit-of-work.port.js';
import { PrismaTransactionHost } from './prisma-transaction-host.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaTransactionHost,
    { provide: UnitOfWork, useExisting: PrismaTransactionHost },
  ],
  exports: [PrismaService, PrismaTransactionHost, UnitOfWork],
})
export class PrismaModule {}
