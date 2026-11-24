/**
 * `private` objects (KYC documents) are only reachable through short-lived
 * signed URLs; `public` objects (portfolio images) have stable URLs.
 */
export type FileVisibility = 'public' | 'private';

export abstract class FileStorage {
  abstract put(key: string, data: Buffer, visibility: FileVisibility): Promise<void>;
  abstract delete(key: string, visibility: FileVisibility): Promise<void>;
  /** Time-limited URL for a private object. */
  abstract signedUrl(key: string): { readonly url: string; readonly expiresAt: Date };
  abstract publicUrl(key: string): string;
}
