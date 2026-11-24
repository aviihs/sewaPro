import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import {
  ResolveDisputeUseCase,
  StartDisputeReviewUseCase,
} from './application/dispute-admin.use-cases.js';
import { GetDisputeUseCase, ListDisputesUseCase } from './application/dispute-queries.use-cases.js';
import { RaiseDisputeUseCase } from './application/raise-dispute.use-case.js';
import { DisputeRepository } from './domain/dispute.js';
import { PrismaDisputeRepository } from './infrastructure/prisma-dispute.repository.js';
import { DisputesController } from './presentation/disputes.controller.js';

@Module({
  imports: [BookingsModule],
  controllers: [DisputesController],
  providers: [
    { provide: DisputeRepository, useClass: PrismaDisputeRepository },
    RaiseDisputeUseCase,
    ListDisputesUseCase,
    GetDisputeUseCase,
    StartDisputeReviewUseCase,
    ResolveDisputeUseCase,
  ],
})
export class DisputesModule {}
