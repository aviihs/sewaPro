import { Injectable } from '@nestjs/common';
import { FileStorage } from '../../../common/ports/file-storage.port.js';
import { type PageRequest, type PaginatedResult } from '../../../common/utils/pagination.js';
import { type ProviderOffering } from '../domain/offering.js';
import {
  DocumentRepository,
  OfferingRepository,
  type ProviderAdminFilter,
  type ProviderAdminSummary,
  ProviderRepository,
} from '../domain/provider.repositories.js';
import { ProviderNotFoundError } from '../domain/providers.errors.js';
import { type DocumentView, toDocumentView } from './provider-access.js';

@Injectable()
export class ListProvidersForAdminUseCase {
  constructor(private readonly providers: ProviderRepository) {}

  execute(
    filter: ProviderAdminFilter,
    page: PageRequest,
  ): Promise<PaginatedResult<ProviderAdminSummary>> {
    return this.providers.listForAdmin(filter, page);
  }
}

export interface ProviderAdminDetail {
  readonly summary: ProviderAdminSummary;
  readonly documents: DocumentView[];
  readonly offerings: ProviderOffering[];
}

/** Everything an admin needs to decide: contact, documents (signed links), offerings. */
@Injectable()
export class GetProviderForAdminUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly documents: DocumentRepository,
    private readonly offerings: OfferingRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(providerId: string): Promise<ProviderAdminDetail> {
    const summary = await this.providers.findAdminSummary(providerId);
    if (!summary) throw new ProviderNotFoundError();
    const [documents, offerings] = await Promise.all([
      this.documents.list(providerId),
      this.offerings.listByProvider(providerId),
    ]);
    return {
      summary,
      documents: documents.map((d) => toDocumentView(this.storage, d)),
      offerings,
    };
  }
}

/** Documents only, with fresh signed links. */
@Injectable()
export class ListProviderDocumentsForAdminUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly documents: DocumentRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(providerId: string): Promise<DocumentView[]> {
    if (!(await this.providers.findById(providerId))) throw new ProviderNotFoundError();
    return (await this.documents.list(providerId)).map((d) => toDocumentView(this.storage, d));
  }
}
