import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const commaList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

/** Optional text where an empty value (`KEY=` in a .env file) means "not set". */
const optionalText = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

/** Secrets must be long random strings (e.g. `openssl rand -base64 48`). */
const secret = z.string().min(32, 'must be at least 32 characters');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    TRUST_PROXY: booleanString,

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),

    CORS_ORIGINS: commaList,

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    LOG_PRETTY: booleanString,

    THROTTLE_TTL_MS: z.coerce.number().int().min(1000).default(60000),
    THROTTLE_LIMIT: z.coerce.number().int().min(1).default(100),

    SENSITIVE_THROTTLE_TTL_MS: z.coerce.number().int().min(1000).default(60000),
    SENSITIVE_THROTTLE_LIMIT: z.coerce.number().int().min(1).default(10),

    SWAGGER_ENABLED: booleanString,
    SWAGGER_USER: z.string().min(1).optional(),
    SWAGGER_PASSWORD: z.string().min(12).optional(),

    JWT_ACCESS_SECRET: secret,
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    OTP_PEPPER: secret,

    EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
    RESEND_API_KEY: optionalText,
    EMAIL_FROM: optionalText,

    PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
    STORAGE_DIR: z.string().min(1).default('./storage'),
    STORAGE_SIGNING_SECRET: secret,
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  })
  .superRefine((env, ctx) => {
    const protectedDocs = env.NODE_ENV === 'production' && env.SWAGGER_ENABLED;
    if (protectedDocs && (!env.SWAGGER_USER || !env.SWAGGER_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SWAGGER_PASSWORD'],
        message:
          'SWAGGER_USER and SWAGGER_PASSWORD are required when docs are enabled in production',
      });
    }
    if (env.EMAIL_PROVIDER === 'resend' && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend',
      });
    }
    if (env.NODE_ENV === 'production' && env.EMAIL_PROVIDER === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message:
          'production needs a real email provider (EMAIL_PROVIDER=resend) for verification codes',
      });
    }
    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must list at least one origin in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
