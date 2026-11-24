/** Something that happened in the domain. `name` is the subscription key. */
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
}

/**
 * Publishes events to in-process subscribers (notifications, audit, and later
 * payments). Use cases publish AFTER their unit of work commits, so listeners
 * never see rolled-back state. Listener failures are logged, never rethrown.
 */
export abstract class DomainEventPublisher {
  abstract publish(...events: DomainEvent[]): Promise<void>;
}
