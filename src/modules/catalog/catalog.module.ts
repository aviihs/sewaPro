import { Module } from '@nestjs/common';
import {
  GetCategoryUseCase,
  GetServiceUseCase,
  ListCategoriesUseCase,
  ListServicesUseCase,
} from './application/catalog-queries.use-cases.js';
import { CatalogSnapshot } from './application/catalog-snapshot.js';
import {
  CreateCategoryUseCase,
  DeleteCategoryUseCase,
  UpdateCategoryUseCase,
} from './application/category-admin.use-cases.js';
import {
  ListActiveCategoriesUseCase,
  ListActiveServicesUseCase,
} from './application/public-catalog.use-cases.js';
import {
  CreateServiceUseCase,
  DeleteServiceUseCase,
  UpdateServiceUseCase,
} from './application/service-admin.use-cases.js';
import { CategoryRepository, ServiceRepository } from './domain/catalog.repositories.js';
import { PrismaCategoryRepository } from './infrastructure/prisma-category.repository.js';
import { PrismaServiceRepository } from './infrastructure/prisma-service.repository.js';
import { AdminCategoriesController } from './presentation/admin-categories.controller.js';
import { AdminServicesController } from './presentation/admin-services.controller.js';
import { CatalogController } from './presentation/catalog.controller.js';

@Module({
  controllers: [CatalogController, AdminCategoriesController, AdminServicesController],
  providers: [
    { provide: CategoryRepository, useClass: PrismaCategoryRepository },
    { provide: ServiceRepository, useClass: PrismaServiceRepository },
    CatalogSnapshot,
    ListActiveCategoriesUseCase,
    ListActiveServicesUseCase,
    ListCategoriesUseCase,
    GetCategoryUseCase,
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
    DeleteCategoryUseCase,
    ListServicesUseCase,
    GetServiceUseCase,
    CreateServiceUseCase,
    UpdateServiceUseCase,
    DeleteServiceUseCase,
  ],
  exports: [ServiceRepository, CategoryRepository, CatalogSnapshot],
})
export class CatalogModule {}
