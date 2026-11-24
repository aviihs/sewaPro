import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/ports/clock.port.js';
import { UnitOfWork } from '../../../common/ports/unit-of-work.port.js';
import { DocumentStatus } from '../domain/media.js';
import { type Provider, type ProviderProfileChanges } from '../domain/provider.js';
import { DocumentRepository, ProviderRepository } from '../domain/provider.repositories.js';
import { DocumentsRequiredError } from '../domain/providers.errors.js';
import { requireOwnProvider } from './provider-access.js';

@Injectable()
export class GetMyProviderProfileUseCase {
  constructor(private readonly providers: ProviderRepository) {}

  execute(userId: string): Promise<Provider> {
    return requireOwnProvider(this.providers, userId);
  }
}

/** Business details, location, radius and the availability switch. */
@Injectable()
export class UpdateMyProviderProfileUseCase {
  constructor(private readonly providers: ProviderRepository) {}

  async execute(userId: string, changes: ProviderProfileChanges): Promise<Provider> {
    const provider = await requireOwnProvider(this.providers, userId);
    return this.providers.updateProfile(provider.id, changes);
  }
}

/** A REJECTED provider sends the profile back for review after uploading new documents. */
@Injectable()
export class ResubmitVerificationUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly documents: DocumentRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  execute(userId: string): Promise<Provider> {
    return this.uow.run(async () => {
      const provider = await requireOwnProvider(this.providers, userId);
      const resubmitted = provider.resubmit(this.clock.now());
      if ((await this.documents.count(provider.id, DocumentStatus.PENDING)) === 0) {
        throw new DocumentsRequiredError();
      }
      return this.providers.saveVerification(resubmitted);
    });
  }
}
