import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto.js';

export const BEARER_AUTH_NAME = 'access-token';

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429;

const DESCRIPTIONS: Readonly<Record<ErrorStatus, string>> = {
  400: 'Validation failed (VALIDATION_FAILED with field details)',
  401: 'Missing, invalid or expired access token',
  403: 'Authenticated but not allowed (role, suspension or ownership)',
  404: 'Resource not found (or not visible to the caller)',
  409: 'Conflicts with the current state of the resource',
  413: 'Payload too large',
  422: 'Business rule violated',
  429: 'Rate limit exceeded',
};

/** Documents error envelopes for the given statuses. */
export function ApiErrors(...statuses: ErrorStatus[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, description: DESCRIPTIONS[status], type: ErrorResponseDto }),
    ),
  );
}

/** Bearer-protected route: documents the scheme plus 401/403. */
export function ApiAuth(): MethodDecorator & ClassDecorator {
  return applyDecorators(ApiBearerAuth(BEARER_AUTH_NAME), ApiErrors(401, 403));
}
