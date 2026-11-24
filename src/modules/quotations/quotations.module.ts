import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import {
  CreateQuotationUseCase,
  ExpireQuotationsUseCase,
  ListQuotationsUseCase,
  SendQuotationUseCase,
} from './application/provider-quotations.use-cases.js';
import { QuotationAccess } from './application/quotation-access.js';
import {
  AcceptQuotationUseCase,
  DeclineQuotationUseCase,
} from './application/respond-quotation.use-cases.js';
import { QuotationRepository } from './domain/quotation.repository.js';
import { PrismaQuotationRepository } from './infrastructure/prisma-quotation.repository.js';
import { QuotationExpiryJob } from './infrastructure/quotation-expiry.job.js';
import { QuotationsController } from './presentation/quotations.controller.js';

@Module({
  imports: [BookingsModule],
  controllers: [QuotationsController],
  providers: [
    { provide: QuotationRepository, useClass: PrismaQuotationRepository },
    QuotationAccess,
    CreateQuotationUseCase,
    SendQuotationUseCase,
    ListQuotationsUseCase,
    AcceptQuotationUseCase,
    DeclineQuotationUseCase,
    ExpireQuotationsUseCase,
    QuotationExpiryJob,
  ],
})
export class QuotationsModule {}
