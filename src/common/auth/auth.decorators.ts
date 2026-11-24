import { type ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { type Request } from 'express';
import { AuthenticationRequiredError } from '../errors/auth.errors.js';
import { type Actor, type AuthenticatedUser, type RequestContext, type Role } from './role.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
export const SENSITIVE_ROUTE_KEY = 'throttle:sensitive';

const MAX_USER_AGENT_LENGTH = 255;

/** Express request after JwtAuthGuard (`id` is the request id set by pino-http). */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Route is reachable without an access token. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Route requires one of the given roles (checked by RolesGuard after authentication). */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Applies the stricter per-IP "sensitive" throttler (login, register, OTP). */
export const SensitiveRateLimit = (): MethodDecorator => SetMetadata(SENSITIVE_ROUTE_KEY, true);

export function requestContextOf(request: AuthenticatedRequest): RequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    requestId: typeof request.id === 'string' ? request.id : null,
  };
}

function authenticatedUserOf(context: ExecutionContext): AuthenticatedUser {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) throw new AuthenticationRequiredError();
  return user;
}

/** The authenticated caller (`{ id, role }`). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => authenticatedUserOf(context),
);

/** The authenticated caller plus IP, user agent and request id, for audited actions. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => ({
    ...authenticatedUserOf(context),
    context: requestContextOf(context.switchToHttp().getRequest<AuthenticatedRequest>()),
  }),
);

/** IP, user agent and request id of the current request. */
export const ReqContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext =>
    requestContextOf(context.switchToHttp().getRequest<AuthenticatedRequest>()),
);
