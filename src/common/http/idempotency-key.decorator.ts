import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import { type Request } from 'express';
import { RequestValidationException } from '../errors/request-validation.exception.js';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const VALID_KEY = /^[A-Za-z0-9_-]{8,64}$/;

/** Parses an optional `Idempotency-Key` header (8-64 chars of [A-Za-z0-9_-]); 400 if malformed. */
export function parseIdempotencyKey(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !VALID_KEY.test(value)) {
    throw new RequestValidationException([
      {
        field: 'Idempotency-Key',
        messages: ['Idempotency-Key must be 8 to 64 characters of letters, digits, "-" or "_"'],
      },
    ]);
  }
  return value;
}

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null =>
    parseIdempotencyKey(
      context.switchToHttp().getRequest<Request>().headers[IDEMPOTENCY_KEY_HEADER],
    ),
);
