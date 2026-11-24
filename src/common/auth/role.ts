/** Account roles. Shared kernel: used by every module's domain and by the auth guards. */
export const Role = {
  CUSTOMER: 'CUSTOMER',
  PROVIDER: 'PROVIDER',
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** Who performed an action. `SYSTEM` covers scheduled jobs and automatic transitions. */
export const ActorRole = { ...Role, SYSTEM: 'SYSTEM' } as const;

export type ActorRole = (typeof ActorRole)[keyof typeof ActorRole];

/** The caller of a use case, as established by the access token. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly role: Role;
}

/** Request facts recorded with sensitive actions (audit, sessions). */
export interface RequestContext {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly requestId: string | null;
}

/** An authenticated actor plus request context, passed into auditable use cases. */
export interface Actor extends AuthenticatedUser {
  readonly context: RequestContext;
}
