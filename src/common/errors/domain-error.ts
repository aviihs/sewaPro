/**
 * Category of a domain failure. The global exception filter maps each kind to
 * one HTTP status, so use cases never deal with HTTP.
 */
export type DomainErrorKind =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'RATE_LIMITED';

export type DomainErrorDetails = Readonly<Record<string, unknown>>;

/** Base class for every expected business failure. `code` is a stable, client-facing identifier. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  protected constructor(
    message: string,
    readonly details?: DomainErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
