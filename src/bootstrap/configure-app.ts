import { VersioningType } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service.js';

export const API_PREFIX = 'api';
export const DEFAULT_API_VERSION = '1';
const JSON_BODY_LIMIT = '1mb';

/**
 * HTTP-adapter level setup shared by `main.ts` and the e2e suite, so tests run
 * against exactly the production pipeline. Global pipe/filter/interceptor/guard
 * are registered in AppModule via APP_* providers.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.use(helmet());
  app.enableCors({
    origin: [...config.corsOrigins],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    credentials: false,
    maxAge: 600,
  });
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: DEFAULT_API_VERSION });
  app.enableShutdownHooks();
}
