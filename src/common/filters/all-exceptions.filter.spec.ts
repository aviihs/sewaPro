import { type ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function createHost(request: Record<string, unknown>) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('writes the error envelope with the request id', () => {
    const { host, status, json } = createHost({ id: 'req-12345678', originalUrl: '/x' });

    filter.catch(new NotFoundException('Gone'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Gone', requestId: 'req-12345678' },
    });
  });

  it('returns a generic 500 for unknown errors and tolerates a missing request id', () => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = createHost({ originalUrl: '/x' });

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId: '' },
    });
    expect(logError).toHaveBeenCalledOnce();
  });
});
