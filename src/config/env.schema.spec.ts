import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.schema.js';

const SECRET = 'x'.repeat(32);
const base = {
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  JWT_ACCESS_SECRET: SECRET,
  OTP_PEPPER: SECRET,
  STORAGE_SIGNING_SECRET: SECRET,
};

describe('validateEnv', () => {
  it('applies defaults and parses lists/booleans', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: ' http://a.com , ,http://b.com',
      LOG_PRETTY: 'true',
    });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      CORS_ORIGINS: ['http://a.com', 'http://b.com'],
      LOG_PRETTY: true,
      SWAGGER_ENABLED: false,
      DATABASE_POOL_MAX: 10,
    });
  });

  it('refuses to boot without a valid postgres URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({})).toThrow(/Invalid environment configuration/);
  });

  it('rejects short secrets', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects malformed numbers and booleans', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...base, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });

  it('requires a CORS allow-list in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
  });

  it('requires docs credentials when docs are enabled in production', () => {
    const prod = { ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://sewapro.com' };
    expect(() => validateEnv({ ...prod, SWAGGER_ENABLED: 'true' })).toThrow(/SWAGGER_PASSWORD/);
    expect(
      validateEnv({
        ...prod,
        SWAGGER_ENABLED: 'true',
        SWAGGER_USER: 'docs',
        SWAGGER_PASSWORD: 'a-long-password',
      }).SWAGGER_ENABLED,
    ).toBe(true);
  });
});
