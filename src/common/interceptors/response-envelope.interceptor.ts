import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, map } from 'rxjs';
import { type SuccessEnvelope } from '../http/envelope.js';
import { CursorPage } from '../utils/cursor.js';
import { PaginatedResult } from '../utils/pagination.js';

/** Wraps every successful response as `{ success: true, data, meta? }`. */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope<unknown>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope<unknown>> {
    return next.handle().pipe(
      map((payload): SuccessEnvelope<unknown> => {
        if (payload instanceof PaginatedResult || payload instanceof CursorPage) {
          return { success: true, data: payload.items, meta: payload.meta };
        }
        return { success: true, data: payload ?? null };
      }),
    );
  }
}
