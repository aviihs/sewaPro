import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  AcceptBookingUseCase,
  CancelBookingUseCase,
  CompleteJobUseCase,
  MarkOnTheWayUseCase,
  RejectBookingUseCase,
  StartJobUseCase,
} from './application/booking-actions.use-cases.js';
import {
  GetBookingDetailUseCase,
  ListMyBookingsUseCase,
  ListProviderBookingsUseCase,
} from './application/booking-queries.use-cases.js';
import { BookingSlotPolicy } from './application/booking-slot-policy.js';
import { BookingTransitionService } from './application/booking-transitions.js';
import { CreateBookingUseCase } from './application/create-booking.use-case.js';
import { BookingRepository } from './domain/booking.repository.js';
import { PrismaBookingRepository } from './infrastructure/prisma-booking.repository.js';
import { CustomerBookingsController } from './presentation/customer-bookings.controller.js';
import { ProviderBookingsController } from './presentation/provider-bookings.controller.js';

@Module({
  imports: [UsersModule, AddressesModule, CatalogModule, ProvidersModule],
  controllers: [CustomerBookingsController, ProviderBookingsController],
  providers: [
    { provide: BookingRepository, useClass: PrismaBookingRepository },
    BookingSlotPolicy,
    BookingTransitionService,
    CreateBookingUseCase,
    ListMyBookingsUseCase,
    ListProviderBookingsUseCase,
    GetBookingDetailUseCase,
    CancelBookingUseCase,
    AcceptBookingUseCase,
    RejectBookingUseCase,
    MarkOnTheWayUseCase,
    StartJobUseCase,
    CompleteJobUseCase,
  ],
  exports: [BookingRepository, BookingTransitionService],
})
export class BookingsModule {}
