import { Module } from '@nestjs/common';
import {
  GetPublicProviderUseCase,
  SearchProvidersUseCase,
} from './application/search.use-cases.js';
import { ProviderSearchReader } from './domain/search.js';
import { PrismaProviderSearchReader } from './infrastructure/prisma-provider-search.reader.js';
import { SearchController } from './presentation/search.controller.js';

/** Must be imported after ProvidersModule (route order, see SearchController). */
@Module({
  controllers: [SearchController],
  providers: [
    { provide: ProviderSearchReader, useClass: PrismaProviderSearchReader },
    SearchProvidersUseCase,
    GetPublicProviderUseCase,
  ],
})
export class SearchModule {}
