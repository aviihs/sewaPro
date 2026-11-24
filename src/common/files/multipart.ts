import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { type UploadPolicy, type UploadedFileData } from './upload-policy.js';

/** The multer fields we use (memory storage). */
export interface MulterFile {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
  readonly originalname: string;
}

export const toUploadedFile = (file: MulterFile | undefined): UploadedFileData | undefined =>
  file && {
    buffer: file.buffer,
    declaredMimeType: file.mimetype,
    size: file.size,
    originalName: file.originalname,
  };

/**
 * Single-file multipart upload in memory, capped at the policy size (larger
 * bodies are cut off by multer with 413) plus documented extra text fields.
 */
export function FileUpload(
  policy: UploadPolicy,
  fields: Record<string, { type: 'string'; enum?: readonly string[]; description: string }> = {},
  required: readonly string[] = [],
): MethodDecorator {
  return applyDecorators(
    UseInterceptors(
      FileInterceptor('file', { limits: { fileSize: policy.maxBytes, files: 1, fields: 5 } }),
    ),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['file', ...required],
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: `${policy.allowed.join(', ')}; max ${policy.maxBytes} bytes; checked by content`,
          },
          ...fields,
        },
      },
    }),
  );
}
