import { Module } from '@nestjs/common';
import { ListAuditLogsUseCase, RecordAuditUseCase } from './application/audit.use-cases.js';
import { AuditLogReader } from './domain/audit-log.js';
import { PrismaAuditLogReader } from './infrastructure/prisma-audit-log.reader.js';
import { AdminAuditController } from './presentation/admin-audit.controller.js';
import { AuditListeners } from './presentation/audit.listeners.js';

@Module({
  controllers: [AdminAuditController],
  providers: [
    { provide: AuditLogReader, useClass: PrismaAuditLogReader },
    ListAuditLogsUseCase,
    RecordAuditUseCase,
    AuditListeners,
  ],
})
export class AuditModule {}
