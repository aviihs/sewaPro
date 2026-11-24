import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { DomainError, type DomainErrorKind } from '../errors/domain-error.js';
import { HttpErrorCode } from '../errors/error-codes.js';
import { RequestValidationException } from '../errors/request-validation.exception.js';

export interface MappedError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

const STATUS_BY_KIND: Readonly<Record<DomainErrorKind, HttpStatus>> = {
  VALIDATION: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  BUSINESS_RULE: HttpStatus.UNPROCESSABLE_ENTITY,
};

const CODE_BY_STATUS: Readonly<Partial<Record<number, HttpErrorCode>>> = {
  [HttpStatus.BAD_REQUEST]: HttpErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: HttpErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: HttpErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: HttpErrorCode.NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: HttpErrorCode.METHOD_NOT_ALLOWED,
  [HttpStatus.CONFLICT]: HttpErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: HttpErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: HttpErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: HttpErrorCode.UNPROCESSABLE,
  [HttpStatus.TOO_MANY_REQUESTS]: HttpErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: HttpErrorCode.SERVICE_UNAVAILABLE,
};

const INTERNAL: MappedError = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  code: HttpErrorCode.INTERNAL_ERROR,
  message: 'An unexpected error occurred',
};

function httpExceptionMessage(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  if (typeof body === 'object' && 'message' in body) {
    const { message } = body;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join('; ');
  }
  return exception.message;
}

/** Translates any thrown value into a stable, non-leaky error description. */
export function mapException(exception: unknown): MappedError {
  if (exception instanceof DomainError) {
    return {
      status: STATUS_BY_KIND[exception.kind],
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }
  if (exception instanceof RequestValidationException) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: HttpErrorCode.VALIDATION_FAILED,
      message: exception.message,
      details: exception.violations,
    };
  }
  if (exception instanceof ThrottlerException) {
    return {
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: HttpErrorCode.RATE_LIMITED,
      message: 'Too many requests, please try again later',
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === (HttpStatus.SERVICE_UNAVAILABLE as number)) {
      return {
        status,
        code: HttpErrorCode.SERVICE_UNAVAILABLE,
        message: 'Service temporarily unavailable',
      };
    }
    if (status >= 500) return { ...INTERNAL, status };
    return {
      status,
      code: CODE_BY_STATUS[status] ?? HttpErrorCode.BAD_REQUEST,
      message: httpExceptionMessage(exception),
    };
  }
  return INTERNAL;
}
