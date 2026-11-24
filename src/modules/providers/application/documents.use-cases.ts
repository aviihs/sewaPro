import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  DOCUMENT_UPLOAD,
  EXTENSION_BY_MIME,
  type UploadedFileData,
  validateUpload,
} from '../../../common/files/upload-policy.js';
import { FileStorage } from '../../../common/ports/file-storage.port.js';
import { DocumentStatus, type DocumentType, MAX_DOCUMENTS } from '../domain/media.js';
import { VerificationStatus } from '../domain/provider.js';
import { DocumentRepository, ProviderRepository } from '../domain/provider.repositories.js';
import {
  DocumentLockedError,
  DocumentNotFoundError,
  UploadNotAllowedError,
} from '../domain/providers.errors.js';
import { type DocumentView, requireOwnProvider, toDocumentView } from './provider-access.js';

@Injectable()
export class ListMyDocumentsUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly documents: DocumentRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(userId: string): Promise<DocumentView[]> {
    const provider = await requireOwnProvider(this.providers, userId);
    const documents = await this.documents.list(provider.id);
    return documents.map((d) => toDocumentView(this.storage, d));
  }
}

/** Validates content (magic bytes, type, size), stores privately, records metadata. */
@Injectable()
export class UploadDocumentUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly documents: DocumentRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(
    userId: string,
    type: DocumentType,
    file: UploadedFileData | undefined,
  ): Promise<DocumentView> {
    const provider = await requireOwnProvider(this.providers, userId);
    if (provider.verificationStatus === VerificationStatus.SUSPENDED) {
      throw new UploadNotAllowedError('Suspended providers cannot upload documents');
    }
    const mimeType = validateUpload(file, DOCUMENT_UPLOAD);
    if ((await this.documents.count(provider.id)) >= MAX_DOCUMENTS) {
      throw new UploadNotAllowedError(
        `At most ${MAX_DOCUMENTS} documents can be stored`,
        MAX_DOCUMENTS,
      );
    }
    const upload = file as UploadedFileData;
    const storageKey = `providers/${provider.id}/documents/${randomUUID()}.${EXTENSION_BY_MIME[mimeType]}`;
    await this.storage.put(storageKey, upload.buffer, 'private');
    try {
      const document = await this.documents.create({
        providerId: provider.id,
        type,
        storageKey,
        mimeType,
        sizeBytes: upload.size,
        originalName: upload.originalName.slice(0, 255) || null,
      });
      return toDocumentView(this.storage, document);
    } catch (error) {
      await this.storage.delete(storageKey, 'private');
      throw error;
    }
  }
}

/** Only unreviewed (PENDING) documents can be removed; reviewed ones are evidence. */
@Injectable()
export class DeleteDocumentUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly documents: DocumentRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(userId: string, documentId: string): Promise<void> {
    const provider = await requireOwnProvider(this.providers, userId);
    const document = await this.documents.findOwned(documentId, provider.id);
    if (!document) throw new DocumentNotFoundError();
    if (document.status !== DocumentStatus.PENDING) throw new DocumentLockedError();
    await this.documents.delete(document.id);
    await this.storage.delete(document.storageKey, 'private');
  }
}
