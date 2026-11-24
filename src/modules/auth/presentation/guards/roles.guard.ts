import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedRequest, ROLES_KEY } from '../../../../common/auth/auth.decorators.js';
import { type Role } from '../../../../common/auth/role.js';
import {
  AuthenticationRequiredError,
  InsufficientRoleError,
} from '../../../../common/errors/auth.errors.js';

/** Global guard enforcing `@Roles(...)`. Runs after JwtAuthGuard has set `request.user`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) throw new AuthenticationRequiredError();
    if (!roles.includes(user.role)) throw new InsufficientRoleError();
    return true;
  }
}
