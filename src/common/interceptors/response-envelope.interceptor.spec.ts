import { describe, it, expect } from 'vitest';
import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { CursorPage } from '../utils/cursor.js';
import { PaginatedResult } from '../utils/pagination.js';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

const context = {} as ExecutionContext;
const handlerOf = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('wraps plain payloads', async () => {
    const result = await firstValueFrom(interceptor.intercept(context, handlerOf({ id: 'a' })));
    expect(result).toEqual({ success: true, data: { id: 'a' } });
  });

  it('turns undefined into null data', async () => {
    const result = await firstValueFrom(interceptor.intercept(context, handlerOf(undefined)));
    expect(result).toEqual({ success: true, data: null });
  });

  it('unwraps cursor pages into data + cursor meta', async () => {
    const page = CursorPage.fromRows([{ id: 'a' }], 20, () => ({ createdAt: new Date(), id: 'a' }));
    const result = await firstValueFrom(interceptor.intercept(context, handlerOf(page)));
    expect(result).toEqual({
      success: true,
      data: [{ id: 'a' }],
      meta: { limit: 20, nextCursor: null, hasMore: false },
    });
  });

  it('unwraps paginated results into data + meta', async () => {
    const page = PaginatedResult.of(['x'], 1, { page: 1, limit: 20 });
    const result = await firstValueFrom(interceptor.intercept(context, handlerOf(page)));
    expect(result).toEqual({ success: true, data: ['x'], meta: page.meta });
  });
});
