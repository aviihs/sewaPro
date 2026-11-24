import { type IncomingMessage, type ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { loggableUrl, resolveRequestId } from './logger.module.js';

describe('loggableUrl', () => {
  it('redacts query strings of file URLs (signatures are credentials)', () => {
    expect(loggableUrl('/api/v1/files/private?key=a.pdf&expires=1&signature=abc')).toBe(
      '/api/v1/files/private?[REDACTED]',
    );
  });

  it('keeps other URLs intact', () => {
    expect(loggableUrl('/api/v1/bookings?status=PENDING')).toBe('/api/v1/bookings?status=PENDING');
    expect(loggableUrl('/api/v1/files/public')).toBe('/api/v1/files/public');
  });
});

describe('resolveRequestId', () => {
  const run = (header?: string) => {
    const setHeader = vi.fn();
    const req = { headers: { 'x-request-id': header } } as unknown as IncomingMessage;
    const id = resolveRequestId(req, { setHeader } as unknown as ServerResponse);
    return { id, setHeader };
  };

  it('reuses safe ids and replaces unsafe ones', () => {
    expect(run('client-req-0001').id).toBe('client-req-0001');
    expect(run('<script>').id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
