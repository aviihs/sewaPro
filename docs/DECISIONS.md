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

## Step 2: Schema, migrations, seed

### D-021 Snake_case tables, UUIDv7 keys, timestamptz

Every model maps to snake_case tables/columns (`@@map`/`@map`) so raw SQL (search, reports) stays readable without quoting. Primary keys are `uuid(7)`: time-ordered, so B-tree inserts stay local and ids sort by creation. All timestamps are `timestamptz(3)`; money is `Decimal(12,2)`; ratings average is `Decimal(3,2)`. Soft delete (`deleted_at`) on users, categories, services and providers. Enums for every status.

### D-022 Partial unique indexes in the Prisma schema

Prisma 7's `partialIndexes` preview keeps these business rules in `schema.prisma` itself: one default address per user, unique live category names / service names per category (soft-deleted rows don't block reuse), one open (DRAFT/SENT) quotation per booking, one unresolved dispute per booking, and a partial index for unread notifications. Predicates are written in the form Postgres stores back (`a = 'x' OR a = 'y'`, not `IN (...)`), otherwise every later diff shows a spurious drop/create.

### D-023 Double booking blocked by an exclusion constraint

`bookings_no_provider_overlap`: `EXCLUDE USING gist (provider_id WITH =, tstzrange(scheduled_at, scheduled_end_at, '[)') WITH &&) WHERE status NOT IN ('CANCELLED','REJECTED')`, using `btree_gist`. Stronger than a unique `(provider_id, scheduled_at)`: it also blocks partially overlapping slots, regardless of slot length. Bookings therefore store `scheduled_end_at`.

### D-024 Hand-written SQL for what Prisma cannot express

Exclusion and CHECK constraints (ratings 1–5, quotation `total = labour + material`, QUOTATION pricing has no price, coordinate ranges, availability windows, settings ranges) live in `prisma/migrations/*_constraints/migration.sql`. Prisma does not model them, so it never tries to drop them.

New migrations are created without a shadow database: change `schema.prisma`, run `bun run prisma:diff > prisma/migrations/<timestamp>_<name>/migration.sql` (diffs the migrated dev DB against the schema), review the SQL, then `bun run prisma:deploy`. `prisma migrate dev` is deliberately not used.

### D-025 PostGIS optional until Step 6

The constraints migration creates `postgis` only if `pg_available_extensions` lists it, otherwise it emits a NOTICE. Migrations therefore ran on a plain PostgreSQL 16 until Step 6; the Step 6 migration (D-079) requires it.

### D-026 Idempotency keys scoped per customer

The brief asked for a unique `idempotencyKey`. It is `UNIQUE (customer_id, idempotency_key)` instead: a global unique would let customer B, by reusing A's key, collide with (or be handed) A's booking, which is an IDOR. Per-customer scope is the standard semantics.

### D-027 Single-value `OtpPurpose`

OTP is used for phone login (which also creates the account on first use and marks the phone verified). The enum exists so further purposes (e.g. password reset) can be added without a schema change to `otp_codes`.

### D-028 User `PENDING` status

Provider accounts start `PENDING` (may log in to finish onboarding, invisible in search) and become `ACTIVE` when an admin verifies them. Customers start `ACTIVE`. `SUSPENDED` users cannot log in.

### D-029 Seed is idempotent and secret-free

`bun run db:seed` builds and runs `dist/src/infrastructure/prisma/seed/run-seed.js` on Node (the Node runtime cannot resolve the generated client's `.js` specifiers from `.ts` sources without a loader, and compiling avoids adding `tsx`). All rows are upserted by natural keys (phone, slug, provider+service); existing users are never modified, so re-running never resets a password. Admin credentials come from `SEED_ADMIN_*`; sample providers/customers are created only when `SEED_SAMPLE_PASSWORD` is set. Seeded: 6 categories, 27 services, 8 verified providers around the Kathmandu valley with Sunday to Friday 09:00 to 18:00 availability, 3 customers.

### D-030 Password hashing with Node's built-in Argon2id

Node 24 ships `crypto.argon2`, so no native addon (and no Bun `trustedDependencies` entry) is needed. Parameters: m=19 MiB, t=2, p=1 (OWASP minimum); hashes are PHC strings, so they remain readable by any argon2 library.

### D-031 E2E database lifecycle

A Vitest `globalSetup` runs `prisma migrate deploy` against `sewapro_test`; suites call `resetDatabase()` (TRUNCATE … CASCADE of all app tables). The helper refuses any `DATABASE_URL` that does not contain `_test`.

## Step 3: Auth, Users, Addresses

### D-032 Global JwtAuthGuard + RolesGuard; `@Public()` opt-out

Both guards are `APP_GUARD`s registered by `AuthModule`, so a new route is protected by default. `@Roles()` restricts by role; ownership is always checked inside use cases. `@CurrentUser()` yields `{ id, role }`; `@CurrentActor()` adds IP, user agent and request id for audited actions.

### D-033 Access token = HS256 JWT (15 min); refresh token = opaque, rotating, hashed

Access tokens carry `sub`, `role`, `typ: access`; algorithm, issuer and audience are pinned on verify. Refresh tokens are 384-bit random strings stored as SHA-256 (fast hash is fine for high-entropy secrets) with a `family_id`. Each refresh atomically revokes the presented token (`UPDATE … WHERE revoked_at IS NULL`) and issues a successor in the same family. Presenting a revoked token, or losing a concurrent rotation race, revokes the whole family (reuse detection). Logout revokes the family; it is public and idempotent because possession of the refresh token is the credential, and it lets clients log out after the access token has expired. Access tokens stay valid until expiry (stateless), but the guard re-checks account status (D-034).

### D-034 Suspension takes effect within 30 seconds

The guard looks up the account status through the `Cache` port (30 s TTL, key in `common/auth/user-status-cache.ts`). Suspending a user deletes that key and revokes all refresh tokens, so the next request is rejected immediately on this instance and within 30 s elsewhere.

### D-035 No user enumeration

Login returns `INVALID_CREDENTIALS` for unknown email, password-less account and wrong password, after equivalent Argon2 work (a dummy hash is verified for unknown emails). `ACCOUNT_SUSPENDED` is only revealed after a correct password. `send-otp` answers identically whether or not the phone is registered. Registration conflicts return one generic `ACCOUNT_ALREADY_EXISTS` (registration can never be fully enumeration-proof without out-of-band verification).

### D-036 OTP: HMAC-hashed, 5 min, 5 attempts, per-phone limits

Codes are 6 digits from `crypto.randomInt`, stored as `HMAC-SHA256(pepper, phone:code)` so a database leak cannot be brute-forced offline. An attempt is spent atomically _before_ comparing (`attempts < 5` in the `UPDATE` predicate), so parallel guessing cannot exceed 5. Issuing a new code burns older ones. Per phone: 60 s resend cooldown and at most 3 codes per 15 minutes (`OTP_RATE_LIMITED`, 429, with `retryAfterSeconds`). Per IP: the "sensitive" throttler (D-038). First OTP sign-in for an unknown phone requires `fullName` and creates a verified customer; a correct code without a name is not consumed, so the client can retry.

### D-037 Messaging behind ports with console adapters

`SmsSender`, `EmailSender`, `PushSender` (in `common/ports`) are bound to logging adapters in `PlatformModule`. The SMS adapter logs the body (so OTPs work locally) with a masked number; production swaps the binding. E2E tests override `SmsSender` with an in-memory capture.

### D-038 Two throttlers

`default` (env `THROTTLE_*`) applies everywhere; `sensitive` (env `SENSITIVE_THROTTLE_*`, default 10/min/IP) applies only to handlers marked `@SensitiveRateLimit()` (register, login, send-otp, verify-otp, refresh) via the throttler's `skipIf`.

### D-039 Ownership failures return 404, not 403

A resource that exists but belongs to someone else is reported as not found (`findOwned(id, userId)` returns null), so ids cannot be probed. 403 is reserved for role failures and suspended accounts.

### D-040 Addresses

Customers only, at most 10 (bounded list, so no pagination). The first address is the default; making another default clears the old one in the same transaction (backed by the partial unique index). Unsetting the current default is refused (`DEFAULT_ADDRESS_REQUIRED`); deleting it promotes the newest remaining address. Coordinates must fall inside Nepal's bounding box. Bookings will copy the address (snapshot), so deleting an address never alters history.

### D-041 Phone numbers in E.164

`@NormalizePhone()` + `@IsNepalPhone()` accept `98XXXXXXXX`, `+977…`, spaces and dashes, and store `+9779XXXXXXXXX` (mobile prefixes 96/97/98). Emails are trimmed and lower-cased at the edge.

## Step 4: Categories & Services (`catalog`)

### D-042 One cached snapshot for the public catalog

`GET /categories` (with nested services) and `GET /services` are served from a single cached snapshot (`catalog:active`, 10 min TTL) of active categories and their active services. The catalog is small (tens of rows), so public lists are not paginated and filtering happens in memory; one key makes invalidation trivial: every admin write deletes it after commit. Admin lists hit the database and are paginated.

### D-043 Delete = soft delete, or deactivate when still in use

`DELETE` on a service soft-deletes it unless a provider actively offers it (`provider_services.is_active`), in which case it is only deactivated (hidden from customers, provider links and booking history stay valid). A category is deactivated if any of its services is offered; otherwise it and its services are soft-deleted. The response says which happened (`outcome: DELETED | DEACTIVATED`). Reactivate with `PATCH { isActive: true }`.

### D-044 Slugs are stable and never reused

Slugs are generated from the name on create (`AC Gas Refill & Check` → `ac-gas-refill-and-check`, suffixed `-2`, `-3` on collision) or set explicitly. Renaming does not change the slug, so links do not break. Uniqueness checks include soft-deleted rows. Names are unique case-insensitively among live rows (category names globally, service names per category); concurrent duplicates are caught by the unique indexes and mapped to the same 409 codes.

### D-045 Audit trail inside the transaction

An `AuditTrail` port (`common/ports`) records admin actions with actor, role, IP, user agent, request id and before/after JSON. It is called inside the use case's unit of work, so the audit row commits or rolls back with the change. Fields whose names look secret (`password`, `token`, `hash`, `otp`, `code`, `secret`) are stripped from the JSON. Step 10 adds event listeners for non-admin sensitive events and the read endpoint.

## Step 5: Providers, documents, availability, verification

### D-046 Provider registration is one transaction and signs in

`POST /providers/register` creates the `PROVIDER` user (`PENDING`) and the provider profile (`PENDING_VERIFICATION`, default settings) in one unit of work, then issues a session so the provider can upload documents immediately. The profile is invisible to customers and cannot be booked until `VERIFIED` (`Provider.isBookable`).

### D-047 Verification state machine in the entity

`Provider` owns the transitions: `PENDING_VERIFICATION → VERIFIED | REJECTED`, `REJECTED → PENDING_VERIFICATION` (resubmit), `VERIFIED → SUSPENDED`, `SUSPENDED → VERIFIED` (reinstate, via the verify endpoint). Anything else is `INVALID_VERIFICATION_TRANSITION` (409). First approval requires at least one document; resubmission requires a new (still `PENDING`) document. Verifying approves pending documents and moves the account from `PENDING` to `ACTIVE`; rejecting marks pending documents `REJECTED` with the reason. Suspension reasons are kept in the audit log and the domain event, not on the profile. Each decision writes an audit row in the same transaction and publishes `provider.verified|rejected|suspended` after commit.

### D-048 Private documents, signed URLs only

KYC documents are written to the `private` area of the `FileStorage` port under random keys (`providers/<id>/documents/<uuid>.<ext>`) and are never exposed by key. Every read endpoint returns a fresh HMAC-SHA256 signed URL valid for `SIGNED_URL_TTL_SECONDS` (default 5 min); `GET /files/private` verifies signature and expiry in constant time and serves with `Cache-Control: private, no-store`. Portfolio images are `public`. The local-disk adapter validates keys against a strict pattern and confines paths to the storage root; production swaps in S3/GCS presigned URLs behind the same port.

### D-049 Upload validation by content

Uploads are single-file multipart in memory. The declared MIME type must equal the type detected from magic bytes (JPEG, PNG, WebP, PDF), so a renamed HTML or executable is rejected (`FILE_TYPE_NOT_ALLOWED`). Size caps are enforced by multer before buffering completes (documents 5 MB, images 3 MB → 413), with per-provider limits of 10 documents and 20 portfolio images. If saving metadata fails, the stored file is deleted.

### D-050 Availability in Nepal time

Weekly windows are minutes since local midnight in Nepal Standard Time (UTC+05:45, no DST); `common/time/nepal-time.ts` converts instants to local day/minute/date. The schedule is replaced as a whole (PUT) inside a transaction; windows must end after they start and must not overlap on the same day. Blocked dates are whole Nepal calendar days, today or later. Settings: `maxDailyBookings` 1–50, `slotMinutes` 15–480 (also enforced by CHECK constraints).

### D-051 Domain events

`DomainEventPublisher` (port) is implemented with `@nestjs/event-emitter`. Use cases publish after their unit of work commits; the publisher awaits listeners (so notifications exist when the HTTP response returns) but logs and swallows listener failures, so a failing side effect never fails the user's request.

### D-052 Earnings summary without money movement

`/providers/me/earnings-summary` reports completed job counts and the sum of `final_amount` for all time and the current Nepal calendar month. There is no commission, payout or balance: those belong to a future payments module (see "Out of scope").

## Step 6: Search

### D-053 Step 6 deferred until PostGIS is installed; Steps 7–11 done first

The local PostgreSQL 16 has no PostGIS (`pg_available_extensions` lists `btree_gist`, `pg_trgm`, `citext`, but not `postgis`), and the brief requires `ST_DWithin`/`ST_Distance` with a GiST index. Instead of stopping the whole build, Steps 7–11 (which do not depend on search) were completed first. Search and the search leg of the Step 12 flow resume after `brew install postgis`. Nothing else depends on Step 6: bookings check the service radius with a pure haversine function (`common/geo/distance.ts`).

**Update (Step 6 done):** the Homebrew `postgis` bottle is built only for PostgreSQL 18 and 19, so local development moved from PostgreSQL 16 to **18** (dev data was dumped from 16 and restored into 18). CI now uses `postgis/postgis:18-3.6`. See D-079 to D-085.

### D-079 `providers.location`: a generated geography column with a GiST index

Migration `20261124000500_provider_location` creates PostGIS unconditionally and adds `location geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED`, plus `providers_location_gist` (GiST). Because Postgres derives it, it can never drift from `latitude`/`longitude`, and no application code writes it. `schema.prisma` declares it as `Unsupported("geography(Point, 4326)")?` with the GiST `@@index`, so `prisma:diff` stays empty. Geography (not geometry) gives distances in metres on the spheroid with no projection maths.

### D-080 One parameterised raw query, one count query

`GET /providers` is built from `Prisma.sql` fragments (`search/infrastructure/provider-search.sql.ts`): every value is a bind parameter, and only fixed SQL (the ORDER BY for an enum `sortBy`) is chosen in code. The page query joins providers → users → live offerings (active `provider_services`, active and undeleted service and category), groups by provider and aggregates the matching offerings with `json_agg`, so a page is **one query** with no follow-ups (no N+1). It selects only the listed columns. A second `COUNT(DISTINCT p.id)` query over the same FROM/WHERE (without the JSON) gives the pagination total; both run in parallel. `GET /providers/:id` is a single Prisma `select` with nested selects.

### D-081 Who is listed

Only providers with `verification_status = 'VERIFIED'`, `is_available`, not soft-deleted, whose account is not `SUSPENDED` or deleted, and who have **at least one live offering matching the filters** (a provider with nothing bookable is not useful in search). `verifiedOnly` is accepted for compatibility with the brief, but search never lists unverified providers, so `false` changes nothing.

### D-082 Location, radius and the provider's own travel radius

`lat` and `lng` are optional but must come together (`INVALID_SEARCH_QUERY`, reason `LOCATION_INCOMPLETE`) and lie in Nepal's bounding box. `radiusKm` is 1 to 50 (default 10) and needs a location. With a location, two `ST_DWithin` predicates apply: the search radius (uses the GiST index) and the provider's `service_radius_km` (so customers only see providers who would travel to them, matching the booking-time service-area rule, D-056). `distanceKm` is `ST_Distance` rounded to 10 m; it is `null` without a location.

### D-083 Filter semantics

All filters combine with AND. `serviceId`, `categoryId`, `minPrice`/`maxPrice` and `q` apply **per offering**: a provider is listed if at least one offering passes them all, and `services`/`minPrice` in a hit describe only those matching offerings. Price filters therefore exclude quotation-only offerings (their price is null). `q` is an `ILIKE` substring of the business name or the service name, with `%`, `_` and `\` escaped; the business name has a trigram index (D-075). `minRating` (0 to 5) and `minExperience` apply to the provider. `availableOn` (Nepal date, today up to 365 days ahead) needs a weekly window on that weekday and no blocked date on it; it does not check per-slot capacity, which booking creation still enforces. Bad combinations (inverted price range, `sortBy=distance` without a location, out-of-range `availableOn`) are 400 `INVALID_SEARCH_QUERY` with a `reason`; malformed values are 400 `VALIDATION_FAILED`.

### D-084 Sorting and stable pages

`sortBy` defaults to `distance` with a location and `rating` without one. `distance`: nearest, then rating. `rating`: average, then count. `price`: lowest matching price, quotation-only last (`NULLS LAST`), then rating. Every order ends with `id`, so offset pages never repeat or skip rows when values tie.

### D-085 Public provider profile and route order

`GET /providers/:id` returns the display name (business name, else full name), bio, experience, rating, completed jobs, travel radius, availability flag, verified/member dates, live offerings with category, portfolio (public URLs) and weekly hours. It never returns phone, email, user id, coordinates or documents. Only verified providers with a non-suspended account are visible; others are 404 (unavailable providers are still visible, with `isAvailable: false`). `SearchModule` is imported after `ProvidersModule` so the static `providers/me…` routes are registered before `providers/:id`; `:id` also uses `ParseUUIDPipe`.

## Step 7: Bookings

### D-054 `BookingStateMachine`: one table, actor rules, exhaustively tested

A pure domain class driven by `BOOKING_TRANSITIONS` (status → status → allowed actor roles). `assert()` throws `BOOKING_INVALID_TRANSITION` (409) for moves that do not exist and `BOOKING_TRANSITION_NOT_ALLOWED` (403) for moves that exist but not for that actor. The unit test checks all 8 × 8 × 4 status/status/actor combinations against an independently written list. Beyond the brief's table: `SYSTEM` may accept a pending booking (used when the customer accepts the provider's quotation, Step 8), and `ADMIN` closes disputes as `COMPLETED` or `CANCELLED` (Step 10). A customer can never complete a booking.

### D-055 Transitions: optimistic concurrency + history + event

`Booking.transition()` returns the new booking and its history row. The repository persists with `UPDATE … WHERE id = ? AND status = <from>`; zero rows means someone else moved it first (`BOOKING_CONCURRENT_UPDATE`, 409). The history row and (on completion) `providers.completed_jobs + 1` are written in the same transaction; `booking.status-changed` is published after commit.

### D-056 Booking creation: checks, lock, constraint

Order: idempotency replay → provider exists, `VERIFIED`, available and its account not suspended → service actively offered and active in the catalog → start at least 30 min ahead and at most 60 days → slot (`slotMinutes`) fits a weekly window on a non-blocked Nepal day → address belongs to the customer → address within the provider's service radius (haversine). Then, in one transaction, the provider row is locked (`SELECT … FOR UPDATE`) so the daily cap (`maxDailyBookings`, counted per Nepal calendar day) and the overlap pre-check cannot be raced; the exclusion constraint (D-023) remains the final guard and maps to `SLOT_UNAVAILABLE` (409). The e2e suite fires five concurrent requests for one slot and expects exactly one success.

### D-057 Idempotency-Key

Optional header, 8–64 chars `[A-Za-z0-9_-]`, scoped per customer (D-026). Replaying the same key with the same provider, service and start time returns the original booking (201, header `Idempotent-Replayed: true`); the same key with a different request is `IDEMPOTENCY_KEY_REUSED` (409).

### D-058 Address snapshot and privacy

The booking copies the address (line, area, city, landmark, coordinates); later address edits or deletion never change it. The provider sees area and city from the start, but the exact line, landmark, coordinates and the customer's phone only from `ACCEPTED` on (and not after a cancellation or rejection). The customer sees the provider's phone under the same rule. Admins see everything. Masking happens in one presenter (`toBookingResponse(detail, viewer)`) driven by `Booking.contactVisible`.

### D-059 Amounts

`quotedPrice` copies the offering's price at booking time (null for QUOTATION); `estimatedAmount` is set by an accepted quotation (Step 8); `finalAmount` is required to complete. All are NPR with two decimals; no payment is taken or recorded.

### D-060 Booking images not exposed yet

The `booking_images` table exists (Step 2) but no upload endpoint was added; it is listed under known limitations.

## Step 8: Quotations

### D-061 Quotation lifecycle and money

`DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED`. A provider drafts a quotation for their own booking while it is `PENDING` or `ACCEPTED`, then sends it; at most one DRAFT/SENT quotation per booking (partial unique index). The client sends `labourCost` and `materialCost`; `total` is never accepted from the client (unknown property → 400) and is computed in integer paisa (`common/domain/money.ts`), and a CHECK constraint enforces `total = labour + material`. Validity is 1–168 hours (default 48). Customers never see drafts.

### D-062 Accepting is one transaction

Quotation → `ACCEPTED`, `booking.estimated_amount = total`, a `PENDING` booking moves to `ACCEPTED` with actor `SYSTEM` (history note names the quotation), and an audit row `quotation.accepted` (actor = customer, IP, request id) is written, all in one unit of work. Both writes use optimistic status checks. After commit, `quotation.responded` and `booking.status-changed` are published.

### D-063 Expiry: checked on accept, swept every minute

Acceptance compares `expires_at` with the clock itself, so an expired quotation can never be accepted, even if the sweeper is late (`QUOTATION_EXPIRED`, 422). `QuotationExpiryJob` (`@nestjs/schedule`, every minute) marks due `SENT` quotations `EXPIRED` with one `UPDATE` on the `(status, expires_at)` index. With several API instances the job runs on each; the `UPDATE` is idempotent, so that is safe (move it to a single worker or a lock if it becomes heavy).

## Step 9: Reviews

### D-064 Who may review, and when

Only the booking's customer, only once the booking is `COMPLETED`, once per booking (unique `booking_id`), and within 30 days of completion (`REVIEW_WINDOW_DAYS`; an addition to the brief so old jobs cannot be review-bombed). Five ratings 1–5 (DTO validation plus a CHECK constraint) and an optional comment.

### D-065 Ratings recomputed from the source, under a lock

Creating or hiding a review recomputes `rating_average` (AVG of visible `overall`, rounded to 2 decimals) and `rating_count` with an aggregate query, in the same transaction, after `SELECT … FOR UPDATE` on the provider row. Recomputing (rather than incrementing) cannot drift; the lock stops two concurrent reviews from each writing an aggregate that misses the other.

### D-066 Public reviews and moderation

`GET /providers/:id/reviews` is public, paginated, newest first, only for `VERIFIED` providers, and shows the author as "First L." Admins list reviews (filters: hidden, provider, `maxOverall`) and soft-hide them with a reason (`hidden_at`, `hidden_by_id`, `hidden_reason`), which recalculates the rating and writes an audit row. Hidden reviews stay in the database.

## Step 10: Notifications, audit, disputes

### D-067 Notifications are written by event listeners

`NotificationListeners` subscribe to domain events (`booking.created`, `booking.status-changed`, `quotation.sent|responded`, `review.created`, `provider.verified|rejected|suspended`, `dispute.opened|resolved`) and call `DispatchNotificationsUseCase`. Event → message mapping is pure (`notification-messages.ts`) and unit-tested. Rules: new booking → provider; accepted/rejected/on the way/started/completed/quotation → customer; review, quotation response → provider; cancellation → the other party (both when an admin cancels); dispute opened → the other party; dispute resolved → both. Times in messages are Nepal time. Each stored notification is also handed to the `PushSender` port (dev adapter logs); push failures are logged and never fail the request. Producing modules know nothing about notifications.

### D-068 Cursor pagination for notifications

Notifications are an append-heavy stream, so they use keyset pagination on `(created_at DESC, id DESC)` (index `notifications_user_id_created_at_id_idx`) instead of offsets: stable under inserts and O(limit) at any depth. The cursor is opaque (base64url of the last row's position); tampered cursors give `INVALID_CURSOR` (400). Repositories fetch `limit + 1` rows to compute `hasMore`. Responses: `meta: { limit, nextCursor, hasMore }`. Unread count uses the partial index on unread rows. Marking read is idempotent; another user's notification is 404.

### D-069 Audit: in-transaction for admin actions, listeners for the rest

Admin decisions (verify/reject/suspend provider, catalog CRUD, hide review, dispute review/resolution) and quotation acceptance write audit rows through `AuditTrail` inside their transaction, with IP, user agent and request id. Sensitive non-admin actions are audited by `AuditListeners` from domain events: booking cancellations, rejections, completions and disputes, dispute openings, and declined quotations. Events carry the actor but not the HTTP request, so those rows have no IP. `GET /admin/audit-logs` is read-only, paginated, newest first, filterable by actor, action (`entity.verb` format), entity type/id and time range; every filter is backed by an index.

### D-070 Disputes

The customer or provider of an `IN_PROGRESS` booking, or of a `COMPLETED` one within 7 days (`DISPUTE_WINDOW_DAYS`), raises a dispute; the dispute row and the booking's move to `DISPUTED` happen in one transaction (`BookingTransitionService.persist`), and events are published after commit. One unresolved dispute per booking (partial unique index → `DISPUTE_ALREADY_OPEN`). Admin flow: `OPEN → UNDER_REVIEW → RESOLVED`, with outcome `BOOKING_COMPLETED` (booking → `COMPLETED`; a final amount is required if the job was never completed) or `BOOKING_CANCELLED` (booking → `CANCELLED`). A job completed via dispute resolution is counted once in `completed_jobs`. Parties and admins can read a dispute; anyone else gets 404.

## Step 11: Admin APIs

### D-071 An `admin` composition module

Admin features that span modules live in `modules/admin`: the dashboard and reports (read side), user suspension (needs `users` + `auth` refresh tokens + `providers`) and booking monitoring. Admin features owned by one module stay there: provider verification (`providers`), catalog CRUD (`catalog`), review moderation (`reviews`), disputes (`disputes`), audit log (`audit`). This avoids a `users → auth` import cycle.

### D-072 Aggregates in SQL, bucketed in Nepal time

Totals use `GROUP BY` over users (role, status), providers (verification status), bookings (status) plus a count of unresolved disputes: four small grouped queries, never loading rows. Reports use `date_trunc(unit, created_at AT TIME ZONE 'Asia/Kathmandu')` with `count(*) FILTER (WHERE …)` and `sum(final_amount) FILTER (…)`, bounded by `created_at` (indexed). Ranges are Nepal calendar dates (inclusive), at most 366 days by day or 60 months by month (`INVALID_REPORT_RANGE`); missing periods are zero-filled in the application. The dashboard shows the current and previous five months and the ten latest audit entries as recent activity. Report row semantics: of the bookings _created_ in a period, how many are now completed or cancelled/rejected, and the completed amount.

### D-073 Suspending users

`POST /admin/users/:id/suspend` (reason required) sets `SUSPENDED`, revokes every refresh token, writes an audit row and deletes the cached status, so the user's live access token is rejected on the next request (D-034). Reactivation returns customers to `ACTIVE` and providers to `ACTIVE` if verified, otherwise `PENDING`. Admins cannot change their own status.

## Step 12: Hardening

### D-074 Security review outcomes

- **Authorization:** every route is protected by default (global guards); `@Public()` routes are: health, auth entry points, provider registration, public catalog, public reviews, and file downloads (private files still need a valid signature). Ownership is enforced inside use cases. `test/security.e2e-spec.ts` runs an IDOR matrix over every `:id` route: same-role strangers get 404, wrong roles 403, anonymous callers 401.
- **Mass assignment:** the global pipe rejects unknown properties; probes for `role`, `status`, `verificationStatus`, `ratingAverage`, booking `status`/`finalAmount` and quotation `total` all return 400.
- **Rate limits:** `default` throttler everywhere; `sensitive` throttler (10/min/IP) on register, login, OTP and refresh, verified by a test with a lowered limit; OTP sends are also limited per phone.
- **Logs:** `Authorization`, cookies and `Idempotency-Key` headers are redacted; request bodies are never logged; query strings under `/files/` are replaced with `[REDACTED]` because signed URLs are credentials; the console SMS adapter hides message bodies (OTPs) in production.
- **Headers/CORS/uploads:** helmet and the CORS allow-list are covered by the platform e2e; uploads are validated by content (D-049).

### D-075 Performance review outcomes

Indexes were checked against every list filter and sort and the missing ones added in `20261124000400_performance_indexes`: bookings `(customer_id, scheduled_at)`, `(status, scheduled_at)`, `(scheduled_at)`; providers `(verification_status, submitted_at)` for the review queue; GIN trigram indexes (`pg_trgm`) on `users.full_name` and `providers.business_name` for admin `contains` search. All list endpoints load related data with joins (`include`/`select`) in one query, so there is no N+1. Every list is paginated, except lists bounded by a business rule: addresses (10), portfolio (20), documents (10), weekly windows (21), quotations per booking, the cached catalog, and blocked dates, now capped at 365 days ahead.

### D-076 Documentation contract test

`test/openapi.e2e-spec.ts` reads `/docs-json` and fails if any operation lacks a tag, a summary or a 2xx response; if a bearer route lacks 401/403; if an `:id` route lacks 400/404; if a route with a body lacks 400; or if a schema mentions a password/token/code hash or a storage key.

### D-077 End-to-end journey

`test/full-flow.e2e-spec.ts` uses only public HTTP: admin creates the catalog → customer registers → provider registers, uploads a document and portfolio image, offers a quotation-priced service, sets hours → admin verifies → customer books (Idempotency-Key) → provider quotes → customer accepts (booking confirmed) → on the way → in progress → complete → review → both parties' notifications, provider dashboard/earnings, admin dashboard and audit trail. The customer finds the provider through the catalog and nearby search, then opens the public profile.

### D-078 Known limitations

- Search pagination is offset-based; very deep pages get slower (fine at marketplace scale; switch to keyset on `(distance, id)` if needed).
- `availableOn` checks working days and blocked dates, not remaining slots on that day.
- `booking_images` exists but has no upload endpoint.
- Throttling, the cache and event delivery are in-process; several API instances need Redis-backed throttler storage and cache, and an outbox or broker for events.
- Event-sourced audit rows have no IP/user agent (D-069).
- The quotation expiry job runs on every instance (idempotent).
- Messaging uses development adapters; production needs SMS/email/push gateways.

## Out of scope (intentionally absent)

Payments, transactions, eSewa/Khalti, commission, payouts, chat, live tracking, AI recommendations, subscriptions. No tables, enums, modules or endpoints exist for them. Bookings will emit domain events (Step 7) so a future `payments` module can subscribe without modifying existing modules.
