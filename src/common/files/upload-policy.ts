import { DomainError } from '../errors/domain-error.js';

export type AllowedMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export const EXTENSION_BY_MIME: Readonly<Record<AllowedMimeType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Transport-neutral view of an uploaded file (built from multer in the controller). */
export interface UploadedFileData {
  readonly buffer: Buffer;
  readonly declaredMimeType: string;
  readonly size: number;
  readonly originalName: string;
}

export interface UploadPolicy {
  readonly allowed: readonly AllowedMimeType[];
  readonly maxBytes: number;
}

const MB = 1024 * 1024;
export const DOCUMENT_UPLOAD: UploadPolicy = {
  allowed: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  maxBytes: 5 * MB,
};
export const IMAGE_UPLOAD: UploadPolicy = {
  allowed: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 3 * MB,
};

const startsWith = (buffer: Buffer, bytes: readonly number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length && bytes.every((b, i) => buffer[offset + i] === b);

/** Identifies the real file type from its magic bytes; null for anything else. */
export function sniffMimeType(buffer: Buffer): AllowedMimeType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

export class FileRequiredError extends DomainError {
  readonly code = 'FILE_REQUIRED';
  readonly kind = 'VALIDATION';
  constructor() {
    super('A file is required (multipart field "file")');
  }
}

export class FileTypeNotAllowedError extends DomainError {
  readonly code = 'FILE_TYPE_NOT_ALLOWED';
  readonly kind = 'VALIDATION';
  constructor(allowed: readonly string[]) {
    super('File content is not an allowed type', { allowed });
  }
}

export class FileTooLargeError extends DomainError {
  readonly code = 'FILE_TOO_LARGE';
  readonly kind = 'VALIDATION';
  constructor(maxBytes: number) {
    super(`File must be at most ${maxBytes} bytes`, { maxBytes });
  }
}

/**
 * Accepts the file only if its bytes are an allowed type AND the declared MIME
 * type agrees (a renamed .exe or HTML file is rejected). Returns the real type.
 */
export function validateUpload(
  file: UploadedFileData | undefined,
  policy: UploadPolicy,
): AllowedMimeType {
  if (!file || file.size === 0) throw new FileRequiredError();
  if (file.size > policy.maxBytes) throw new FileTooLargeError(policy.maxBytes);
  const actual = sniffMimeType(file.buffer);
  if (!actual || !policy.allowed.includes(actual) || actual !== file.declaredMimeType) {
    throw new FileTypeNotAllowedError(policy.allowed);
  }
  return actual;
}
