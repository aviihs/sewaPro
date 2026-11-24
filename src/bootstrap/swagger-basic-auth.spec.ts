import { type Request, type Response } from 'express';
import { describe, it, expect, vi } from 'vitest';
import { swaggerBasicAuth } from './swagger-basic-auth.js';

function run(authorization?: string) {
  const next = vi.fn<(error?: unknown) => void>();
  const send = vi.fn();
  const res = { setHeader: vi.fn(), status: vi.fn(() => ({ send })) };
  const req = { headers: { authorization } } as unknown as Request;
  swaggerBasicAuth('docs', 'correct-horse')(req, res as unknown as Response, next);
  return { next, res };
}

const basic = (credentials: string): string =>
  `Basic ${Buffer.from(credentials).toString('base64')}`;

describe('swaggerBasicAuth', () => {
  it('lets valid credentials through', () => {
    expect(run(basic('docs:correct-horse')).next).toHaveBeenCalled();
  });

  it.each([
    ['no header', undefined],
    ['wrong password', basic('docs:wrong')],
    ['wrong user', basic('admin:correct-horse')],
    ['missing separator', basic('docscorrect-horse')],
    ['wrong scheme', 'Bearer abc'],
  ])('challenges on %s', (_label, header) => {
    const { next, res } = run(header);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', expect.any(String));
  });
});
