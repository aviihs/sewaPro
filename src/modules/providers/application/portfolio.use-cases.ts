import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  EXTENSION_BY_MIME,
  IMAGE_UPLOAD,
  type UploadedFileData,
  validateUpload,
} from '../../../common/files/upload-policy.js';
import { FileStorage } from '../../../common/ports/file-storage.port.js';
import { MAX_PORTFOLIO_IMAGES } from '../domain/media.js';
import { PortfolioRepository, ProviderRepository } from '../domain/provider.repositories.js';
import { PortfolioImageNotFoundError, UploadNotAllowedError } from '../domain/providers.errors.js';
import { type PortfolioView, requireOwnProvider, toPortfolioView } from './provider-access.js';

@Injectable()
export class ListMyPortfolioUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly portfolio: PortfolioRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(userId: string): Promise<PortfolioView[]> {
    const provider = await requireOwnProvider(this.providers, userId);
    return (await this.portfolio.list(provider.id)).map((i) => toPortfolioView(this.storage, i));
  }
}

@Injectable()
export class AddPortfolioImageUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly portfolio: PortfolioRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(
    userId: string,
    file: UploadedFileData | undefined,
    caption: string | null,
  ): Promise<PortfolioView> {
    const provider = await requireOwnProvider(this.providers, userId);
    const mimeType = validateUpload(file, IMAGE_UPLOAD);
    const count = await this.portfolio.count(provider.id);
    if (count >= MAX_PORTFOLIO_IMAGES) {
      throw new UploadNotAllowedError(
        `At most ${MAX_PORTFOLIO_IMAGES} portfolio images are allowed`,
        MAX_PORTFOLIO_IMAGES,
      );
    }
    const upload = file as UploadedFileData;
    const storageKey = `providers/${provider.id}/portfolio/${randomUUID()}.${EXTENSION_BY_MIME[mimeType]}`;
    await this.storage.put(storageKey, upload.buffer, 'public');
    try {
      const image = await this.portfolio.create({
        providerId: provider.id,
        storageKey,
        mimeType,
        sizeBytes: upload.size,
        caption,
        sortOrder: count,
      });
      return toPortfolioView(this.storage, image);
    } catch (error) {
      await this.storage.delete(storageKey, 'public');
      throw error;
    }
  }
}

@Injectable()
export class DeletePortfolioImageUseCase {
  constructor(
    private readonly providers: ProviderRepository,
    private readonly portfolio: PortfolioRepository,
    private readonly storage: FileStorage,
  ) {}

  async execute(userId: string, imageId: string): Promise<void> {
    const provider = await requireOwnProvider(this.providers, userId);
    const image = await this.portfolio.findOwned(imageId, provider.id);
    if (!image) throw new PortfolioImageNotFoundError();
    await this.portfolio.delete(image.id);
    await this.storage.delete(image.storageKey, 'public');
  }
}
