import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  type AuthenticatedRequest,
  IS_PUBLIC_KEY,
} from '../../../../common/auth/auth.decorators.js';
import { AuthenticationRequiredError } from '../../../../common/errors/auth.errors.js';
import { AuthenticateAccessTokenUseCase } from '../../application/authenticate-access-token.use-case.js';

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

/** Global guard: every route needs a valid access token unless marked `@Public()`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticate: AuthenticateAccessTokenUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = BEARER.exec(request.headers.authorization ?? '');
    const token = match?.[1];
    if (!token) throw new AuthenticationRequiredError();
    request.user = await this.authenticate.execute(token);
    return true;
  }
}
