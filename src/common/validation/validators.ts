import { Transform } from 'class-transformer';
import { ValidateBy, type ValidationOptions, buildMessage } from 'class-validator';
import { normalizeNepalPhone } from './nepal-phone.js';

/** Validates a Nepal mobile number (after `@NormalizePhone()` it is in E.164 form). */
export function IsNepalPhone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isNepalPhone',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && normalizeNepalPhone(value) === value,
        defaultMessage: buildMessage(
          (prefix) => `${prefix}$property must be a valid Nepal mobile number (e.g. 9841234567)`,
          options,
        ),
      },
    },
    options,
  );
}

/** Rewrites a valid Nepal mobile number to E.164; leaves invalid input for the validator. */
export function NormalizePhone(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (normalizeNepalPhone(value) ?? value) : value,
  );
}

/** Trims strings; leaves other values untouched for the type validators. */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/** Trims and lower-cases strings (emails, slugs). */
export function TrimLower(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}

/** Parses `true`/`false` query strings into booleans (implicit conversion is disabled). */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
}
