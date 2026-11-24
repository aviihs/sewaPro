import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import {
  CreateReviewUseCase,
  HideReviewUseCase,
  ListProviderReviewsUseCase,
  ListReviewsForModerationUseCase,
  RatingRecalculator,
} from './application/reviews.use-cases.js';
import { ReviewRepository } from './domain/review.js';
import { PrismaReviewRepository } from './infrastructure/prisma-review.repository.js';
import { ReviewsController } from './presentation/reviews.controller.js';

@Module({
  imports: [BookingsModule, ProvidersModule],
  controllers: [ReviewsController],
  providers: [
    { provide: ReviewRepository, useClass: PrismaReviewRepository },
    RatingRecalculator,
    CreateReviewUseCase,
    ListProviderReviewsUseCase,
    ListReviewsForModerationUseCase,
    HideReviewUseCase,
  ],
})
export class ReviewsModule {}
