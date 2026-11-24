import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  GetBookingForAdminUseCase,
  ListAllBookingsUseCase,
} from './application/admin-bookings.use-cases.js';
import {
  GetAdminDashboardUseCase,
  GetBookingReportUseCase,
  GetGrowthReportUseCase,
} from './application/admin-reports.use-cases.js';
import {
  ListUsersUseCase,
  ReactivateUserUseCase,
  SuspendUserUseCase,
  UserStatusChanger,
} from './application/admin-users.use-cases.js';
import { AdminStatsReader } from './domain/admin-stats.js';
import { PrismaAdminStatsReader } from './infrastructure/prisma-admin-stats.reader.js';
import { AdminDashboardController } from './presentation/admin-dashboard.controller.js';
import { AdminUsersBookingsController } from './presentation/admin-users-bookings.controller.js';

/** Composition of admin-only features that span several modules. */
@Module({
  imports: [UsersModule, AuthModule, ProvidersModule, BookingsModule],
  controllers: [AdminDashboardController, AdminUsersBookingsController],
  providers: [
    { provide: AdminStatsReader, useClass: PrismaAdminStatsReader },
    GetAdminDashboardUseCase,
    GetBookingReportUseCase,
    GetGrowthReportUseCase,
    ListUsersUseCase,
    UserStatusChanger,
    SuspendUserUseCase,
    ReactivateUserUseCase,
    ListAllBookingsUseCase,
    GetBookingForAdminUseCase,
  ],
})
export class AdminModule {}
