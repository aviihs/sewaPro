# Architecture & Engineering Decisions

Each entry: **decision**, then why. Newest steps at the bottom.

## Step 1: Scaffold & platform

### D-001 NestJS 12 as native ESM

Nest 12 (latest stable) ships ESM-only (`"type": "module"`), and so does the app: relative imports end in `.js`, top-level `await bootstrap()`. Fighting it with a CommonJS build would rely on `require(esm)` interop for every Nest package.

### D-002 TypeScript 6.0, not 7

TS 7 is the native (Go) compiler and does not run TypeScript compiler-API transformers, which the `@nestjs/swagger` CLI plugin needs. `@nestjs/cli` 12 and `typescript-eslint` 8 both pin `<6.1`.

### D-003 Vitest instead of Jest (deviation from the brief)

The brief asked for Jest. With Nest 12 being ESM, Jest's VM-modules runtime fails to load CommonJS ecosystem packages that `require()` ESM Nest (`@nestjs/throttler` → `@nestjs/common` raises `ERR_REQUIRE_CYCLE_MODULE`). This is a Jest limitation, not an app bug: the same code runs under plain Node. Vitest is Nest 12's official test runner, has a Jest-compatible API (`describe/it/expect`, `vi.fn` ≈ `jest.fn`), runs on Vite 8 whose transformer emits decorator metadata (DI works in tests), and Supertest is unchanged. Specs import test APIs explicitly from `vitest` (no globals).

### D-004 Bun as the only package manager; Node 24 LTS as the runtime

Bun is the only package manager and script runner (`bun install`, `bun run <script>`, `bunx`); `packageManager` is pinned to `bun@1.3.14` and `bun.lock` is committed. npm, pnpm and yarn are not used, and their lockfiles are git-ignored. Bun blocks dependency lifecycle scripts unless listed in `trustedDependencies`: only Prisma (engines) and `@parcel/watcher` are trusted; `@scarf/scarf` (install telemetry) stays blocked.

The application, the Nest CLI and Vitest still execute on **Node 24 LTS** (pinned in `.nvmrc` and `engines`). Nest 12 + Prisma 7 + the Swagger CLI plugin are built and supported against Node; running the server on the Bun runtime is a separate decision that can be revisited later.

### D-005 Prisma 7 with the `prisma-client` generator + `@prisma/adapter-pg`

Prisma 7 uses driver adapters and a TS-generated client. The client is generated into `src/infrastructure/prisma/generated/` (git-ignored, rebuilt by `bun run prisma:generate`), which keeps "Prisma only in infrastructure" physically true. The connection URL lives in `prisma.config.ts`; the runtime pool (size, idle timeout, connect timeout) is configured on the pg adapter from validated env. `prisma@7.10.1` is pinned exactly because the registry's `latest` tag currently points at an 8.0 release candidate.

### D-006 Unit of Work via AsyncLocalStorage

`UnitOfWork` (abstract class in `common/ports`) is the only thing use cases see. `PrismaTransactionHost` implements it with `prisma.$transaction` and stores the transaction client in `AsyncLocalStorage`; repositories always read `host.client`, so any repository call inside `uow.run()` joins the transaction automatically, and nested `run()` calls reuse the outer one. No transaction object is threaded through use-case signatures.

### D-007 One global exception filter + pure mapper

`AllExceptionsFilter` delegates to `mapException()` (pure, fully unit-tested). Domain errors carry a `kind` (`NOT_FOUND`, `CONFLICT`, `BUSINESS_RULE`→422, …) and a stable `code`; the mapper owns the kind→status table. 5xx responses never leak messages (`INTERNAL_ERROR`; 503 → `SERVICE_UNAVAILABLE`) and are logged with the request id.

### D-008 Global pipe/filter/interceptor/guard registered as `APP_*` providers

Registered in `AppModule` rather than `app.useGlobal*()`, so the e2e suite, which builds the app from `AppModule`, gets the identical pipeline. HTTP-adapter concerns (helmet, CORS, body limit, prefix, versioning, shutdown hooks) live in `bootstrap/configure-app.ts`, shared by `main.ts` and tests.

### D-009 No separate LoggingInterceptor

`nestjs-pino` (pino-http) already logs every request/response with method, URL, status, latency and request id. An extra interceptor would double-log. Health probes are excluded from access logs; `Authorization`, cookies and `Idempotency-Key` are redacted.

### D-010 Request id

Inbound `X-Request-Id` is reused only if it matches `^[A-Za-z0-9_-]{8,64}$` (prevents log injection); otherwise a UUID is generated. It is echoed in the response header and in every error body.

### D-011 Paginated responses

Use cases return `PaginatedResult<T>`; `ResponseEnvelopeInterceptor` unwraps it into `{ success, data, meta }`. Default page size 20, hard cap 100 (`PaginationQueryDto`). Notifications will use a cursor variant (Step 10).

### D-012 Validation strictness

Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`, `transform`, and **no implicit conversion**: query DTOs must declare `@Type(() => Number)` etc., so coercion is always explicit. Errors are flattened to `{ field: 'a.b[0].c', messages[] }`.

### D-013 Env validation with Zod, fail-fast

`validateEnv` runs inside `ConfigModule.forRoot({ validate })`; any invalid variable aborts boot with a list of issues. Cross-field rules: production requires a CORS allow-list, and docs in production require Basic-auth credentials (password ≥ 12 chars).

### D-014 Swagger exposure

Docs at `/docs` and `/docs-json` (outside the `/api` prefix). Always on in development/test; off in production unless `SWAGGER_ENABLED=true`, in which case HTTP Basic auth (constant-time compare) is mandatory. The document is built lazily on first request.

### D-015 Health endpoints

`/api/v1/health/live` (no dependencies) and `/api/v1/health/ready` (database `SELECT 1`). Both skip rate limiting.

### D-016 Cache port with typed keys

`Cache` takes `CacheKey<T>` (created with `cacheKey<T>('name')`), so values come back correctly typed without casts at call sites. The current adapter is an in-process map with TTL and bounded size (oldest-first eviction). Swapping in Redis means providing another `Cache` implementation in `CacheModule`.

### D-017 Rate limiting

Global `ThrottlerGuard` (in-memory storage) with env-configured defaults. Sensitive routes (OTP, login) get stricter per-route limits in Step 3. In-memory storage is per-instance; move to Redis storage when running more than one replica.

### D-018 Docker deferred

Per the project owner, development currently runs directly on the host machine (local PostgreSQL), not in Docker. The Dockerfile and `docker-compose.yml` are deliberately not added yet. CI still uses a `postgis/postgis` service container because that is GitHub's runner, not the developer machine.

### D-019 Layer boundaries enforced by ESLint

`no-restricted-imports` per layer: `domain/` may not import NestJS, Prisma or outer layers; `application/` may not import infrastructure/presentation or Prisma; `presentation/` and `common/` may not import Prisma. Circular imports fail `bun run deps:cycles` (madge; the generated Prisma client is excluded because its internal cycles are by design).

### D-020 `no-unsafe-class-instance-assignment` disabled

This newer typescript-eslint strict rule flags object literals typed as classes. Nest DTOs must be classes (for Swagger/validation metadata), and response mappers legitimately return plain objects shaped like them.

## Out of scope (intentionally absent)

Payments, transactions, eSewa/Khalti, commission, payouts, chat, live tracking, AI recommendations, subscriptions. No tables, enums, modules or endpoints exist for them. Bookings will emit domain events (Step 7) so a future `payments` module can subscribe without modifying existing modules.
