import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type DomainEvent, DomainEventPublisher } from '../../common/ports/domain-events.port.js';

/**
 * In-process delivery via EventEmitter2. Awaits all listeners (so a request
 * completes after its notifications are written) but isolates their failures.
 */
@Injectable()
export class EventEmitterPublisher extends DomainEventPublisher {
  private readonly logger = new Logger(EventEmitterPublisher.name);

  constructor(private readonly emitter: EventEmitter2) {
    super();
  }

  async publish(...events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      try {
        await this.emitter.emitAsync(event.name, event);
      } catch (error) {
        this.logger.error({ err: error, event: event.name }, 'Domain event listener failed');
      }
    }
  }
}
