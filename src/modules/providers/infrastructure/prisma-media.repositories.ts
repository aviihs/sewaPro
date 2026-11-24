import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../infrastructure/prisma/prisma-transaction-host.js';
import {
  type DocumentStatus,
  type NewPortfolioImage,
  type NewProviderDocument,
  type PortfolioImage,
  type ProviderDocument,
} from '../domain/media.js';
import { DocumentRepository, PortfolioRepository } from '../domain/provider.repositories.js';

const documentSelect = {
  id: true,
  providerId: true,
  type: true,
  storageKey: true,
  mimeType: true,
  sizeBytes: true,
  originalName: true,
  status: true,
  reviewNote: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaDocumentRepository extends DocumentRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client.providerDocument;
  }

  list(providerId: string): Promise<ProviderDocument[]> {
    return this.db.findMany({
      where: { providerId },
      select: documentSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(providerId: string, status?: DocumentStatus): Promise<number> {
    return this.db.count({ where: { providerId, status } });
  }

  create(document: NewProviderDocument): Promise<ProviderDocument> {
    return this.db.create({ data: document, select: documentSelect });
  }

  findOwned(id: string, providerId: string): Promise<ProviderDocument | null> {
    return this.db.findFirst({ where: { id, providerId }, select: documentSelect });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete({ where: { id } });
  }

  async reviewPending(
    providerId: string,
    status: DocumentStatus,
    note: string | null,
  ): Promise<void> {
    await this.db.updateMany({
      where: { providerId, status: 'PENDING' },
      data: { status, reviewNote: note },
    });
  }
}

@Injectable()
export class PrismaPortfolioRepository extends PortfolioRepository {
  constructor(private readonly host: PrismaTransactionHost) {
    super();
  }

  private get db() {
    return this.host.client.portfolioImage;
  }

  list(providerId: string): Promise<PortfolioImage[]> {
    return this.db.findMany({
      where: { providerId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  count(providerId: string): Promise<number> {
    return this.db.count({ where: { providerId } });
  }

  create(image: NewPortfolioImage): Promise<PortfolioImage> {
    return this.db.create({ data: image });
  }

  findOwned(id: string, providerId: string): Promise<PortfolioImage | null> {
    return this.db.findFirst({ where: { id, providerId } });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete({ where: { id } });
  }
}
