import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  GetProviderForAdminUseCase,
  ListProviderDocumentsForAdminUseCase,
  ListProvidersForAdminUseCase,
} from './application/admin-providers.queries.js';
import {
  RejectProviderUseCase,
  SuspendProviderUseCase,
  VerificationDeps,
  VerifyProviderUseCase,
} from './application/admin-verification.use-cases.js';
import {
  AddBlockedDateUseCase,
  GetMyAvailabilityUseCase,
  RemoveBlockedDateUseCase,
  ReplaceAvailabilityWindowsUseCase,
  UpdateProviderSettingsUseCase,
} from './application/availability.use-cases.js';
import {
  GetEarningsSummaryUseCase,
  GetProviderDashboardUseCase,
} from './application/dashboard.use-cases.js';
import {
  DeleteDocumentUseCase,
  ListMyDocumentsUseCase,
  UploadDocumentUseCase,
} from './application/documents.use-cases.js';
import {
  ListMyOfferingsUseCase,
  RemoveMyOfferingUseCase,
  UpsertMyOfferingUseCase,
} from './application/offerings.use-cases.js';
import {
  AddPortfolioImageUseCase,
  DeletePortfolioImageUseCase,
  ListMyPortfolioUseCase,
} from './application/portfolio.use-cases.js';
import {
  GetMyProviderProfileUseCase,
  ResubmitVerificationUseCase,
  UpdateMyProviderProfileUseCase,
} from './application/profile.use-cases.js';
import { RegisterProviderUseCase } from './application/register-provider.use-case.js';
import {
  AvailabilityRepository,
  DocumentRepository,
  OfferingRepository,
  PortfolioRepository,
  ProviderRepository,
  ProviderStatsReader,
} from './domain/provider.repositories.js';
import { PrismaAvailabilityRepository } from './infrastructure/prisma-availability.repository.js';
import {
  PrismaDocumentRepository,
  PrismaPortfolioRepository,
} from './infrastructure/prisma-media.repositories.js';
import { PrismaOfferingRepository } from './infrastructure/prisma-offering.repository.js';
import { PrismaProviderStatsReader } from './infrastructure/prisma-provider-stats.reader.js';
import { PrismaProviderRepository } from './infrastructure/prisma-provider.repository.js';
import { AdminProvidersController } from './presentation/admin-providers.controller.js';
import { MyProviderOfferController } from './presentation/my-provider-offer.controller.js';
import { MyProviderProfileController } from './presentation/my-provider-profile.controller.js';
import { MyProviderScheduleController } from './presentation/my-provider-schedule.controller.js';

@Module({
  imports: [UsersModule, AuthModule, CatalogModule],
  controllers: [
    MyProviderProfileController,
    MyProviderOfferController,
    MyProviderScheduleController,
    AdminProvidersController,
  ],
  providers: [
    { provide: ProviderRepository, useClass: PrismaProviderRepository },
    { provide: OfferingRepository, useClass: PrismaOfferingRepository },
    { provide: DocumentRepository, useClass: PrismaDocumentRepository },
    { provide: PortfolioRepository, useClass: PrismaPortfolioRepository },
    { provide: AvailabilityRepository, useClass: PrismaAvailabilityRepository },
    { provide: ProviderStatsReader, useClass: PrismaProviderStatsReader },
    RegisterProviderUseCase,
    GetMyProviderProfileUseCase,
    UpdateMyProviderProfileUseCase,
    ResubmitVerificationUseCase,
    ListMyOfferingsUseCase,
    UpsertMyOfferingUseCase,
    RemoveMyOfferingUseCase,
    ListMyPortfolioUseCase,
    AddPortfolioImageUseCase,
    DeletePortfolioImageUseCase,
    ListMyDocumentsUseCase,
    UploadDocumentUseCase,
    DeleteDocumentUseCase,
    GetMyAvailabilityUseCase,
    ReplaceAvailabilityWindowsUseCase,
    AddBlockedDateUseCase,
    RemoveBlockedDateUseCase,
    UpdateProviderSettingsUseCase,
    GetProviderDashboardUseCase,
    GetEarningsSummaryUseCase,
    ListProvidersForAdminUseCase,
    GetProviderForAdminUseCase,
    ListProviderDocumentsForAdminUseCase,
    VerificationDeps,
    VerifyProviderUseCase,
    RejectProviderUseCase,
    SuspendProviderUseCase,
  ],
  exports: [ProviderRepository, OfferingRepository, AvailabilityRepository, PortfolioRepository],
})
export class ProvidersModule {}
