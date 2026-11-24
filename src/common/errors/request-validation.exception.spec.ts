import { describe, it, expect } from 'vitest';
import { ValidationError } from 'class-validator';
import { flattenValidationErrors } from './request-validation.exception.js';

function error(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return Object.assign(new ValidationError(), { property, constraints, children });
}

describe('flattenValidationErrors', () => {
  it('flattens nested objects and arrays into dotted/indexed paths', () => {
    const errors = [
      error('phone', { isPhone: 'phone is invalid' }),
      error('address', undefined, [error('lat', { isLatitude: 'lat must be a latitude' })]),
      error('images', undefined, [
        error('0', undefined, [error('url', { isUrl: 'url must be a URL' })]),
      ]),
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'phone', messages: ['phone is invalid'] },
      { field: 'address.lat', messages: ['lat must be a latitude'] },
      { field: 'images[0].url', messages: ['url must be a URL'] },
    ]);
  });

  it('returns an empty list when there are no errors', () => {
    expect(flattenValidationErrors([])).toEqual([]);
  });
});
