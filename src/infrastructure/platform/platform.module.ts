import { Global, Injectable, Module } from '@nestjs/common';
import { AuditTrail } from '../../common/ports/audit-trail.port.js';
import { Clock } from '../../common/ports/clock.port.js';
import { DomainEventPublisher } from '../../common/ports/domain-events.port.js';
import { EmailSender, PushSender, SmsSender } from '../../common/ports/messaging.port.js';
import { PasswordHasher } from '../../common/ports/password-hasher.port.js';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  ConsoleEmailSender,
  ConsolePushSender,
  ConsoleSmsSender,
} from '../messaging/console-messaging.adapters.js';
import { PrismaAuditTrail } from '../audit/prisma-audit-trail.js';
import { EventEmitterPublisher } from '../events/event-emitter.publisher.js';
import { Argon2PasswordHasher } from '../security/argon2-password-hasher.js';

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** Cross-cutting adapters every module may depend on through their ports. */
@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    {
      provide: SmsSender,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new ConsoleSmsSender(!config.isProduction),
    },
    { provide: EmailSender, useClass: ConsoleEmailSender },
    { provide: PushSender, useClass: ConsolePushSender },
    { provide: AuditTrail, useClass: PrismaAuditTrail },
    { provide: DomainEventPublisher, useClass: EventEmitterPublisher },
  ],
  exports: [
    Clock,
    PasswordHasher,
    SmsSender,
    EmailSender,
    PushSender,
    AuditTrail,
    DomainEventPublisher,
  ],
})
export class PlatformModule {}
