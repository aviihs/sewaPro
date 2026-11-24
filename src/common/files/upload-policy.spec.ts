import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from '../../../test/unit/fixtures/files.js';
import {
  DOCUMENT_UPLOAD,
  FileRequiredError,
  FileTooLargeError,
  FileTypeNotAllowedError,
  IMAGE_UPLOAD,
  sniffMimeType,
  validateUpload,
} from './upload-policy.js';

const file = (buffer: Buffer, declaredMimeType: string, size = buffer.length) => ({
  buffer,
  declaredMimeType,
  size,
  originalName: 'f',
});

describe('sniffMimeType', () => {
  it('detects allowed types from magic bytes', () => {
    expect(sniffMimeType(SAMPLE_FILES.jpeg)).toBe('image/jpeg');
    expect(sniffMimeType(SAMPLE_FILES.png)).toBe('image/png');
    expect(sniffMimeType(SAMPLE_FILES.webp)).toBe('image/webp');
    expect(sniffMimeType(SAMPLE_FILES.pdf)).toBe('application/pdf');
    expect(sniffMimeType(SAMPLE_FILES.html)).toBeNull();
    expect(sniffMimeType(Buffer.from('RIFF0000AVI '))).toBeNull();
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
  });
});

describe('validateUpload', () => {
  it('returns the real type for a consistent, allowed file', () => {
    expect(validateUpload(file(SAMPLE_FILES.pdf, 'application/pdf'), DOCUMENT_UPLOAD)).toBe(
      'application/pdf',
    );
  });

  it('requires a non-empty file', () => {
    expect(() => validateUpload(undefined, IMAGE_UPLOAD)).toThrow(FileRequiredError);
    expect(() => validateUpload(file(Buffer.alloc(0), 'image/png'), IMAGE_UPLOAD)).toThrow(
      FileRequiredError,
    );
  });

  it('enforces the size limit', () => {
    expect(() =>
      validateUpload(file(SAMPLE_FILES.png, 'image/png', 4 * 1024 * 1024), IMAGE_UPLOAD),
    ).toThrow(FileTooLargeError);
  });

  it('rejects disguised files, mismatched MIME types and types outside the policy', () => {
    expect(() => validateUpload(file(SAMPLE_FILES.html, 'image/png'), IMAGE_UPLOAD)).toThrow(
      FileTypeNotAllowedError,
    );
    expect(() => validateUpload(file(SAMPLE_FILES.png, 'image/jpeg'), IMAGE_UPLOAD)).toThrow(
      FileTypeNotAllowedError,
    );
    expect(() => validateUpload(file(SAMPLE_FILES.pdf, 'application/pdf'), IMAGE_UPLOAD)).toThrow(
      FileTypeNotAllowedError,
    );
  });
});
