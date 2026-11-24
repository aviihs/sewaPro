import { describe, expect, it } from 'vitest';
import { CursorPage, InvalidCursorError, decodeCursor, encodeCursor } from './cursor.js';

const id = '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f';
const row = (n: number) => ({ id, createdAt: new Date(Date.UTC(2030, 0, n)) });

describe('cursor pagination', () => {
  it('round-trips a position', () => {
    const position = { createdAt: new Date('2030-01-01T00:00:00.000Z'), id };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('rejects tampered cursors', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(InvalidCursorError);
    expect(() => decodeCursor(Buffer.from('2030-01-01|x').toString('base64url'))).toThrow(
      InvalidCursorError,
    );
  });

  it('uses the extra row to detect more pages', () => {
    const page = CursorPage.fromRows([row(3), row(2), row(1)], 2, (r) => r);
    expect(page.items).toHaveLength(2);
    expect(page.meta).toEqual({ limit: 2, hasMore: true, nextCursor: encodeCursor(row(2)) });
    expect(CursorPage.fromRows([row(1)], 2, (r) => r).meta).toEqual({
      limit: 2,
      hasMore: false,
      nextCursor: null,
    });
    expect(page.map((r) => r.id).items).toEqual([id, id]);
  });
});
