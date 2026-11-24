import { describe, it, expect } from 'vitest';
import { type ArgumentMetadata } from '@nestjs/common';
import { PaginationQueryDto } from '../dto/pagination-query.dto.js';
import { RequestValidationException } from '../errors/request-validation.exception.js';
import { createValidationPipe } from './validation.pipe.js';

const queryMeta: ArgumentMetadata = { type: 'query', metatype: PaginationQueryDto };

describe('global ValidationPipe', () => {
  const pipe = createValidationPipe();

  it('transforms and applies defaults', async () => {
    const result = (await pipe.transform({ page: '2' }, queryMeta)) as PaginationQueryDto;
    expect(result).toBeInstanceOf(PaginationQueryDto);
    expect(result).toMatchObject({ page: 2, limit: 20 });
  });

  it('rejects unknown properties', async () => {
    await expect(pipe.transform({ page: '1', admin: 'true' }, queryMeta)).rejects.toBeInstanceOf(
      RequestValidationException,
    );
  });

  it('rejects limits above the cap with field details', async () => {
    const failure: unknown = await pipe
      .transform({ limit: '500' }, queryMeta)
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(RequestValidationException);
    expect((failure as RequestValidationException).violations).toEqual([
      { field: 'limit', messages: ['limit must not be greater than 100'] },
    ]);
  });
});
