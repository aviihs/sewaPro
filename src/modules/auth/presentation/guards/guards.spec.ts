import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { mockOf } from '../../../../../test/unit/mock.js';
import { type AuthenticatedRequest } from '../../../../common/auth/auth.decorators.js';
import {
  AuthenticationRequiredError,
  InsufficientRoleError,
} from '../../../../common/errors/auth.errors.js';
import { AuthenticateAccessTokenUseCase } from '../../application/authenticate-access-token.use-case.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => Object,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: unknown): Reflector {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(value);
  return reflector;
}

describe('JwtAuthGuard', () => {
  const authenticate = mockOf<AuthenticateAccessTokenUseCase>();

  it('lets public routes through without a token', async () => {
    const guard = new JwtAuthGuard(reflectorReturning(true), authenticate);
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });

  it('requires a bearer token', async () => {
    const guard = new JwtAuthGuard(reflectorReturning(undefined), authenticate);
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it('attaches the authenticated user', async () => {
    authenticate.execute.mockResolvedValue({ id: 'u1', role: 'CUSTOMER' });
    const request: Partial<AuthenticatedRequest> = { headers: { authorization: 'Bearer a.b.c' } };
    const guard = new JwtAuthGuard(reflectorReturning(undefined), authenticate);
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(authenticate.execute).toHaveBeenCalledWith('a.b.c');
    expect(request.user).toEqual({ id: 'u1', role: 'CUSTOMER' });
  });
});

describe('RolesGuard', () => {
  it('allows routes without role requirements', () => {
    expect(new RolesGuard(reflectorReturning(undefined)).canActivate(contextFor({}))).toBe(true);
    expect(new RolesGuard(reflectorReturning([])).canActivate(contextFor({}))).toBe(true);
  });

  it('allows a matching role and rejects others', () => {
    const guard = new RolesGuard(reflectorReturning(['ADMIN']));
    expect(guard.canActivate(contextFor({ user: { id: 'a', role: 'ADMIN' } }))).toBe(true);
    expect(() => guard.canActivate(contextFor({ user: { id: 'c', role: 'CUSTOMER' } }))).toThrow(
      InsufficientRoleError,
    );
    expect(() => guard.canActivate(contextFor({}))).toThrow(AuthenticationRequiredError);
  });
});
