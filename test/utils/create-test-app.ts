import { type Type } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap/configure-app.js';
import { setupSwagger } from '../../src/bootstrap/swagger.js';
import { EmailSender, SmsSender } from '../../src/common/ports/messaging.port.js';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { type Env } from '../../src/config/env.schema.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { CapturingEmailSender, CapturingSmsSender } from './fakes.js';

export interface TestAppOptions {
  readonly controllers?: Type[];
  /** Per-IP limit for `@SensitiveRateLimit()` routes (the test env default is effectively unlimited). */
  readonly sensitiveThrottleLimit?: number;
}

/** Real config with selected values overridden (Object.create keeps the other getters). */
function configWith(config: ConfigService<Env, true>, options: TestAppOptions): AppConfigService {
  const real = new AppConfigService(config);
  if (options.sensitiveThrottleLimit === undefined) return real;
  const limit = options.sensitiveThrottleLimit;
  return Object.create(real, {
    sensitiveThrottle: { get: () => ({ ttlMs: 60_000, limit }) },
  }) as AppConfigService;
}

export interface TestContext {
  readonly app: NestExpressApplication;
  readonly prisma: PrismaService;
  readonly sms: CapturingSmsSender;
  readonly email: CapturingEmailSender;
  readonly http: () => ReturnType<typeof request>;
}

/** Boots the real AppModule with the production HTTP pipeline; SMS and email are captured in memory. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestContext> {
  const sms = new CapturingSmsSender();
  const email = new CapturingEmailSender();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(SmsSender)
    .useValue(sms)
    .overrideProvider(EmailSender)
    .useValue(email)
    .overrideProvider(AppConfigService)
    .useFactory({
      factory: (config: ConfigService<Env, true>) => configWith(config, options),
      inject: [ConfigService],
    })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  setupSwagger(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    sms,
    email,
    http: () => request(app.getHttpServer()),
  };
}
