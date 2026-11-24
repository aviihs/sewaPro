import { type ExecutionContext, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SENSITIVE_ROUTE_KEY } from './common/auth/auth.decorators.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import { AppConfigModule } from './config/app-config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { CacheModule } from './infrastructure/cache/cache.module.js';
import { HealthModule } from './infrastructure/health/health.module.js';
import { LoggerModule } from './infrastructure/logger/logger.module.js';
import { PlatformModule } from './infrastructure/platform/platform.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { AddressesModule } from './modules/addresses/addresses.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { DisputesModule } from './modules/disputes/disputes.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ProvidersModule } from './modules/providers/providers.module.js';
import { QuotationsModule } from './modules/quotations/quotations.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { UsersModule } from './modules/users/users.module.js';

/** True for handlers marked with `@SensitiveRateLimit()`. */
const isSensitiveRoute = (context: ExecutionContext): boolean =>
  Reflect.getMetadata(SENSITIVE_ROUTE_KEY, context.getHandler()) === true;

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          { name: 'default', ttl: config.throttle.ttlMs, limit: config.throttle.limit },
          {
            name: 'sensitive',
            ttl: config.sensitiveThrottle.ttlMs,
            limit: config.sensitiveThrottle.limit,
            skipIf: (context) => !isSensitiveRoute(context),
          },
        ],
      }),
    }),
    PrismaModule,
    CacheModule,
    EventEmitterModule.forRoot({ wildcard: false, ignoreErrors: false }),
    ScheduleModule.forRoot(),
    PlatformModule,
    StorageModule,
    HealthModule,
    UsersModule,
    AuthModule,
    AddressesModule,
    CatalogModule,
    ProvidersModule,
    SearchModule,
    BookingsModule,
    QuotationsModule,
    ReviewsModule,
    NotificationsModule,
    AuditModule,
    DisputesModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
