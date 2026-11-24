import { type FileStorage } from '../../../common/ports/file-storage.port.js';
import { type PortfolioImage, type ProviderDocument } from '../domain/media.js';
import { type Provider } from '../domain/provider.js';
import { type ProviderRepository } from '../domain/provider.repositories.js';
import { ProviderNotFoundError } from '../domain/providers.errors.js';

/** The provider profile owned by the signed-in user (every /providers/me route starts here). */
export async function requireOwnProvider(
  providers: ProviderRepository,
  userId: string,
): Promise<Provider> {
  const provider = await providers.findByUserId(userId);
  if (!provider) throw new ProviderNotFoundError();
  return provider;
}

/** A private document plus a short-lived download link. */
export interface DocumentView {
  readonly document: ProviderDocument;
  readonly url: string;
  readonly urlExpiresAt: Date;
}

export interface PortfolioView {
  readonly image: PortfolioImage;
  readonly url: string;
}

export function toDocumentView(storage: FileStorage, document: ProviderDocument): DocumentView {
  const signed = storage.signedUrl(document.storageKey);
  return { document, url: signed.url, urlExpiresAt: signed.expiresAt };
}

export const toPortfolioView = (storage: FileStorage, image: PortfolioImage): PortfolioView => ({
  image,
  url: storage.publicUrl(image.storageKey),
});
