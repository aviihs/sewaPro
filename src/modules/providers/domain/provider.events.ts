import { type DomainEvent } from '../../../common/ports/domain-events.port.js';

interface ProviderEventData {
  readonly providerId: string;
  readonly userId: string;
}

export class ProviderVerifiedEvent implements DomainEvent {
  static readonly NAME = 'provider.verified';
  readonly name = ProviderVerifiedEvent.NAME;
  constructor(
    readonly data: ProviderEventData,
    readonly occurredAt: Date,
  ) {}
}

export class ProviderRejectedEvent implements DomainEvent {
  static readonly NAME = 'provider.rejected';
  readonly name = ProviderRejectedEvent.NAME;
  constructor(
    readonly data: ProviderEventData & { readonly reason: string },
    readonly occurredAt: Date,
  ) {}
}

export class ProviderSuspendedEvent implements DomainEvent {
  static readonly NAME = 'provider.suspended';
  readonly name = ProviderSuspendedEvent.NAME;
  constructor(
    readonly data: ProviderEventData & { readonly reason: string },
    readonly occurredAt: Date,
  ) {}
}
