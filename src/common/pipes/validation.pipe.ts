import { ValidationPipe } from '@nestjs/common';
import {
  RequestValidationException,
  flattenValidationErrors,
} from '../errors/request-validation.exception.js';

/** Strict global validation: unknown properties are rejected, payloads are transformed to DTO instances. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    stopAtFirstError: false,
    exceptionFactory: (errors) => new RequestValidationException(flattenValidationErrors(errors)),
  });
}
