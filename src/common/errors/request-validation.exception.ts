import { BadRequestException } from '@nestjs/common';
import { type ValidationError } from 'class-validator';

export interface FieldViolation {
  readonly field: string;
  readonly messages: readonly string[];
}

/** Flattens nested class-validator errors into `a.b[0].c`-style field paths. */
export function flattenValidationErrors(
  errors: readonly ValidationError[],
  parentPath = '',
): FieldViolation[] {
  return errors.flatMap((error) => {
    const isIndex = /^\d+$/.test(error.property);
    const segment = isIndex ? `[${error.property}]` : error.property;
    const path =
      parentPath === '' || isIndex ? `${parentPath}${segment}` : `${parentPath}.${segment}`;
    const own: FieldViolation[] = error.constraints
      ? [{ field: path, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], path)];
  });
}

/** Thrown by the global ValidationPipe; rendered as VALIDATION_FAILED with field details. */
export class RequestValidationException extends BadRequestException {
  constructor(readonly violations: readonly FieldViolation[]) {
    super('Request validation failed');
  }
}
