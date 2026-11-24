import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, type AuthenticatedUser } from '../../../common/auth/role.js';
import { AccessTokenService } from '../application/auth.ports.js';

export const JWT_ISSUER = 'sewapro-api';
export const JWT_AUDIENCE = 'sewapro-clients';

interface AccessClaims {
  readonly sub?: unknown;
  readonly role?: unknown;
  readonly typ?: unknown;
}

const ROLES = new Set<string>(Object.values(Role));
const isRole = (value: unknown): value is Role => typeof value === 'string' && ROLES.has(value);

/** HS256 JWT access tokens. Algorithm, issuer and audience are pinned on verify. */
@Injectable()
export class JwtAccessTokenService extends AccessTokenService {
  constructor(private readonly jwt: JwtService) {
    super();
  }

  sign(user: AuthenticatedUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, role: user.role, typ: 'access' });
  }

  async verify(token: string): Promise<AuthenticatedUser | null> {
    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (claims.typ !== 'access' || typeof claims.sub !== 'string' || !isRole(claims.role)) {
        return null;
      }
      return { id: claims.sub, role: claims.role };
    } catch {
      return null;
    }
  }
}
