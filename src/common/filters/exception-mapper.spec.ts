import { describe, it, expect } from 'vitest';
import {
  BadRequestException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  InternalServerErrorException,
  ImATeapotException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { DomainError, type DomainErrorKind } from '../errors/domain-error.js';
import { HttpErrorCode } from '../errors/error-codes.js';
import { RequestValidationException } from '../errors/request-validation.exception.js';
import { mapException } from './exception-mapper.js';

class TestDomainError extends DomainError {
  readonly code = 'TEST_FAILURE';
  constructor(readonly kind: DomainErrorKind) {
    super('Test failure', { reason: 'test' });
  }
}

describe('mapException', () => {
  it.each<[DomainErrorKind, HttpStatus]>([
    ['VALIDATION', HttpStatus.BAD_REQUEST],
    ['UNAUTHORIZED', HttpStatus.UNAUTHORIZED],
    ['FORBIDDEN', HttpStatus.FORBIDDEN],
    ['NOT_FOUND', HttpStatus.NOT_FOUND],
    ['CONFLICT', HttpStatus.CONFLICT],
    ['BUSINESS_RULE', HttpStatus.UNPROCESSABLE_ENTITY],
  ])('maps domain error kind %s to HTTP %d', (kind, status) => {
    expect(mapException(new TestDomainError(kind))).toEqual({
      status,
      code: 'TEST_FAILURE',
      message: 'Test failure',
      details: { reason: 'test' },
    });
  });

  it('maps request validation failures with field details', () => {
    const violations = [{ field: 'phone', messages: ['phone is invalid'] }];
    expect(mapException(new RequestValidationException(violations))).toEqual({
      status: 400,
      code: HttpErrorCode.VALIDATION_FAILED,
      message: 'Request validation failed',
      details: violations,
    });
  });

  it('maps throttling to RATE_LIMITED', () => {
    expect(mapException(new ThrottlerException())).toMatchObject({
      status: 429,
      code: HttpErrorCode.RATE_LIMITED,
    });
  });

  it('maps known 4xx HttpExceptions by status', () => {
    expect(mapException(new NotFoundException('Missing'))).toEqual({
      status: 404,
      code: HttpErrorCode.NOT_FOUND,
      message: 'Missing',
    });
    expect(mapException(new PayloadTooLargeException())).toMatchObject({
      code: HttpErrorCode.PAYLOAD_TOO_LARGE,
    });
  });

  it('joins array messages and falls back to BAD_REQUEST for unmapped 4xx', () => {
    expect(mapException(new BadRequestException({ message: ['a', 'b'] })).message).toBe('a; b');
    expect(mapException(new ImATeapotException())).toMatchObject({
      status: 418,
      code: HttpErrorCode.BAD_REQUEST,
    });
  });

  it('uses the exception message when the response body has none', () => {
    const exception = new BadRequestException({ reason: 'x' });
    expect(mapException(exception).message).toBe(exception.message);
  });

  it('maps 503 to SERVICE_UNAVAILABLE without leaking the body', () => {
    expect(mapException(new ServiceUnavailableException({ db: 'down' }))).toEqual({
      status: 503,
      code: HttpErrorCode.SERVICE_UNAVAILABLE,
      message: 'Service temporarily unavailable',
    });
  });

  it('hides internals of 5xx HttpExceptions and unknown errors', () => {
    expect(mapException(new InternalServerErrorException('db password wrong'))).toEqual({
      status: 500,
      code: HttpErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    });
    expect(mapException(new Error('secret stack'))).toMatchObject({
      status: 500,
      code: HttpErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    });
  });
});
