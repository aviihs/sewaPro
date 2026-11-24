import { type CursorMeta } from '../utils/cursor.js';
import { type PaginationMeta } from '../utils/pagination.js';

export interface SuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: PaginationMeta | CursorMeta;
}

export interface ErrorEnvelope {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
    readonly requestId: string;
  };
}
