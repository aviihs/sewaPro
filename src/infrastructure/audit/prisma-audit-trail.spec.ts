import { describe, expect, it } from 'vitest';
import { Prisma } from '../prisma/generated/client.js';
import { toAuditJson } from './prisma-audit-trail.js';

describe('toAuditJson', () => {
  it('serializes dates and strips secret-looking fields at any depth', () => {
    const value = {
      id: 'u1',
      passwordHash: 'x',
      at: new Date('2030-01-01T00:00:00Z'),
      nested: { refreshToken: 'r', name: 'n', otpCode: '1' },
    };
    expect(toAuditJson(value)).toEqual({
      id: 'u1',
      at: '2030-01-01T00:00:00.000Z',
      nested: { name: 'n' },
    });
  });

  it('maps missing values to JSON null', () => {
    expect(toAuditJson(undefined)).toBe(Prisma.JsonNull);
    expect(toAuditJson(null)).toBe(Prisma.JsonNull);
  });
});
