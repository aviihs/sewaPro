import { describe, expect, it } from 'vitest';
import { RequestValidationException } from '../errors/request-validation.exception.js';
import { parseIdempotencyKey } from './idempotency-key.decorator.js';

describe('parseIdempotencyKey', () => {
  it('accepts a missing or well-formed key', () => {
    expect(parseIdempotencyKey(undefined)).toBeNull();
    expect(parseIdempotencyKey('booking-2030-01-07_a1')).toBe('booking-2030-01-07_a1');
  });

  it.each(['short', 'x'.repeat(65), 'has space here', ['a', 'b']])('rejects %s', (value) => {
    expect(() => parseIdempotencyKey(value)).toThrow(RequestValidationException);
  });
});
