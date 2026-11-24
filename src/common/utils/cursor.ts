import { DomainError } from '../errors/domain-error.js';

export interface CursorRequest {
  readonly limit: number;
  readonly cursor?: string;
}

/** Position after which the next page starts: newest-first ordering on (createdAt, id). */
export interface CursorPosition {
  readonly createdAt: Date;
  readonly id: string;
}

export interface CursorMeta {
  readonly limit: number;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';
  readonly kind = 'VALIDATION';
  constructor() {
    super('The cursor is invalid; start again without one');
  }
}

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(`${position.createdAt.toISOString()}|${position.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  const [iso = '', id = ''] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/.test(id))
    throw new InvalidCursorError();
  return { createdAt, id };
}

/**
 * A page of a newest-first stream. Repositories fetch `limit + 1` rows; the
 * extra row only signals that more exist. Unwrapped by the response envelope.
 */
export class CursorPage<T> {
  private constructor(
    readonly items: readonly T[],
    readonly meta: CursorMeta,
  ) {}

  static fromRows<T>(
    rows: readonly T[],
    limit: number,
    positionOf: (item: T) => CursorPosition,
  ): CursorPage<T> {
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    const nextCursor = hasMore && last ? encodeCursor(positionOf(last)) : null;
    return new CursorPage(items, { limit, nextCursor, hasMore });
  }

  map<R>(mapper: (item: T) => R): CursorPage<R> {
    return new CursorPage(this.items.map(mapper), this.meta);
  }
}
