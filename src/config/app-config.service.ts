import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env } from './env.schema.js';

export interface DatabaseConfig {
  readonly url: string;
  readonly poolMax: number;
  readonly idleTimeoutMs: number;
}

export interface SwaggerConfig {
  readonly enabled: boolean;
  readonly credentials: { readonly user: string; readonly password: string } | null;
}

/** Typed, read-only access to validated configuration. */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.get('PORT');
  }

  get trustProxy(): boolean {
    return this.get('TRUST_PROXY');
  }

  get corsOrigins(): readonly string[] {
    return this.get('CORS_ORIGINS');
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }

  get logPretty(): boolean {
    return this.get('LOG_PRETTY');
  }

  get throttle(): { readonly ttlMs: number; readonly limit: number } {
    return { ttlMs: this.get('THROTTLE_TTL_MS'), limit: this.get('THROTTLE_LIMIT') };
  }

  get database(): DatabaseConfig {
    return {
      url: this.get('DATABASE_URL'),
      poolMax: this.get('DATABASE_POOL_MAX'),
      idleTimeoutMs: this.get('DATABASE_POOL_IDLE_TIMEOUT_MS'),
    };
  }

  get swagger(): SwaggerConfig {
    const enabled = !this.isProduction || this.get('SWAGGER_ENABLED');
    const user = this.get('SWAGGER_USER');
    const password = this.get('SWAGGER_PASSWORD');
    const credentials = this.isProduction && user && password ? { user, password } : null;
    return { enabled, credentials };
  }
}
