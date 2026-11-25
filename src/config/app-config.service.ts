import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env } from './env.schema.js';

export interface DatabaseConfig {
  readonly url: string;
  readonly poolMax: number;
  readonly idleTimeoutMs: number;
}

export interface AuthConfig {
  readonly accessSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlDays: number;
  readonly otpPepper: string;
}

export interface StorageConfig {
  readonly dir: string;
  readonly signingSecret: string;
  readonly signedUrlTtlSeconds: number;
  readonly publicBaseUrl: string;
}

export type EmailConfig =
  | { readonly provider: 'console' }
  | { readonly provider: 'resend'; readonly apiKey: string; readonly from: string };

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

  /** Stricter limit for credential and OTP endpoints. */
  get sensitiveThrottle(): { readonly ttlMs: number; readonly limit: number } {
    return {
      ttlMs: this.get('SENSITIVE_THROTTLE_TTL_MS'),
      limit: this.get('SENSITIVE_THROTTLE_LIMIT'),
    };
  }

  get email(): EmailConfig {
    const apiKey = this.get('RESEND_API_KEY');
    const from = this.get('EMAIL_FROM');
    if (this.get('EMAIL_PROVIDER') === 'resend' && apiKey && from) {
      return { provider: 'resend', apiKey, from };
    }
    return { provider: 'console' };
  }

  get auth(): AuthConfig {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      accessTtlSeconds: this.get('JWT_ACCESS_TTL_SECONDS'),
      refreshTtlDays: this.get('REFRESH_TOKEN_TTL_DAYS'),
      otpPepper: this.get('OTP_PEPPER'),
    };
  }

  get storage(): StorageConfig {
    return {
      dir: this.get('STORAGE_DIR'),
      signingSecret: this.get('STORAGE_SIGNING_SECRET'),
      signedUrlTtlSeconds: this.get('SIGNED_URL_TTL_SECONDS'),
      publicBaseUrl: this.get('PUBLIC_BASE_URL'),
    };
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
