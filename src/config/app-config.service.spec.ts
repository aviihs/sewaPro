import { type ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AppConfigService } from './app-config.service.js';
import { type Env, validateEnv } from './env.schema.js';

function serviceFor(raw: Record<string, string>): AppConfigService {
  const secret = 's'.repeat(32);
  const env = validateEnv({
    DATABASE_URL: 'postgresql://u@localhost:5432/db',
    JWT_ACCESS_SECRET: secret,
    OTP_PEPPER: secret,
    STORAGE_SIGNING_SECRET: secret,
    ...raw,
  });
  const config = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
  return new AppConfigService(config);
}

const resend = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_key', EMAIL_FROM: 'a@b.co' };
const production = { NODE_ENV: 'production', CORS_ORIGINS: 'https://sewapro.com', ...resend };

describe('AppConfigService', () => {
  it('exposes typed runtime settings', () => {
    const config = serviceFor({
      PORT: '4000',
      TRUST_PROXY: 'true',
      LOG_LEVEL: 'debug',
      LOG_PRETTY: 'true',
      CORS_ORIGINS: 'http://a.com',
      THROTTLE_TTL_MS: '5000',
      THROTTLE_LIMIT: '7',
    });

    expect(config.nodeEnv).toBe('development');
    expect(config.isProduction).toBe(false);
    expect(config.port).toBe(4000);
    expect(config.trustProxy).toBe(true);
    expect(config.logLevel).toBe('debug');
    expect(config.logPretty).toBe(true);
    expect(config.corsOrigins).toEqual(['http://a.com']);
    expect(config.throttle).toEqual({ ttlMs: 5000, limit: 7 });
    expect(config.database).toEqual({
      url: 'postgresql://u@localhost:5432/db',
      poolMax: 10,
      idleTimeoutMs: 30000,
    });
  });

  it('exposes auth, storage and sensitive throttle settings with defaults', () => {
    const config = serviceFor({});
    expect(config.auth).toEqual({
      accessSecret: 's'.repeat(32),
      accessTtlSeconds: 900,
      refreshTtlDays: 30,
      otpPepper: 's'.repeat(32),
    });
    expect(config.storage).toEqual({
      dir: './storage',
      signingSecret: 's'.repeat(32),
      signedUrlTtlSeconds: 300,
      publicBaseUrl: 'http://localhost:3000',
    });
    expect(config.sensitiveThrottle).toEqual({ ttlMs: 60000, limit: 10 });
  });

  it('always enables unprotected docs outside production', () => {
    expect(serviceFor({}).swagger).toEqual({ enabled: true, credentials: null });
  });

  it('disables docs in production by default', () => {
    expect(serviceFor(production).swagger.enabled).toBe(false);
  });

  it('protects docs with credentials when enabled in production', () => {
    const config = serviceFor({
      ...production,
      SWAGGER_ENABLED: 'true',
      SWAGGER_USER: 'docs',
      SWAGGER_PASSWORD: 'a-long-password',
    });
    expect(config.swagger).toEqual({
      enabled: true,
      credentials: { user: 'docs', password: 'a-long-password' },
    });
  });

  it('selects the email provider', () => {
    expect(serviceFor({}).email).toEqual({ provider: 'console' });
    expect(serviceFor(resend).email).toEqual({
      provider: 'resend',
      apiKey: 're_key',
      from: 'a@b.co',
    });
  });
});
