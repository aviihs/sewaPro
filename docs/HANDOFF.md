# SewaPro: Session Handoff

Read this first in a new session. Then read `README.md` (overview, modules) and
`docs/DECISIONS.md` (every decision and why, D-001 to D-078).

Last updated: 2026-11-24.

## 1. Status

| Step  | What                                                                  | State                                       |
| ----- | --------------------------------------------------------------------- | ------------------------------------------- |
| 1     | Scaffold, config, Prisma, lint, Swagger, common layer                 | ✅                                          |
| 2     | Schema (23 models), migrations, constraints, seed                     | ✅                                          |
| 3     | Auth (password + phone OTP, JWT + rotating refresh), users, addresses | ✅                                          |
| 4     | Catalog: categories and services, admin CRUD                          | ✅                                          |
| 5     | Providers, KYC documents, availability, admin verification            | ✅                                          |
| **6** | **Nearby search (PostGIS)**                                           | **⏸ NOT STARTED: PostGIS is not installed** |
| 7     | Bookings, state machine, history, events                              | ✅                                          |
| 8     | Quotations and the expiry job                                         | ✅                                          |
| 9     | Reviews and rating recompute                                          | ✅                                          |
| 10    | Notifications, audit, disputes                                        | ✅                                          |
| 11    | Admin dashboard, reports, users, bookings                             | ✅                                          |
| 12    | Hardening, security and OpenAPI tests, full flow                      | ✅ (search leg waits for Step 6)            |

Last green run: `bun run verify` passed with **573 unit tests**, `bun run test:e2e`
passed with **93 e2e tests (14 files)**, and domain + application coverage was **97.5%**.
Nothing is committed to git. Only commit when the owner asks.

**Next job: Step 6** (plan in section 6). First check that PostGIS is installed:

```bash
psql -d sewapro -tAc "select name from pg_available_extensions where name='postgis'"
```

Empty output means the owner still has to run `brew install postgis`. Disk space is low
(often 1 to 4 GB free), so warn them before they install.

## 2. Standing rules (from the owner, never break)

- **Bun only** (`bun install`, `bun run`, `bunx`). Never npm, pnpm or yarn.
- The app and tests run on **Node 24**: `source ~/.nvm/nvm.sh && nvm use`.
- **No Docker.** PostgreSQL 16 runs on the host (Homebrew). Databases: `sewapro` (dev) and `sewapro_test` (e2e).
- Out of scope: **no payments, transactions, commission, payouts, chat, live tracking or AI**. No tables, modules or endpoints for them.
- Clean Architecture per module: `domain → application → infrastructure → presentation`. Dependencies point inward. Prisma only in `infrastructure/`. ESLint enforces this.
- One use-case class per action, with a single `execute()`. Controllers validate, call one use case and map to a DTO. Use cases depend on abstract-class ports.
- Throw domain errors only. One global filter maps them to HTTP.
- Never return Prisma models or password hashes. Map row → entity → response DTO.
- Source files under ~200 lines. No `any`, `console.log`, TODOs, commented-out code or circular imports.
- **Definition of done for every step:**
  - Full DTO validation and Swagger docs.
  - `@Roles` on routes, and ownership checks in the use case: another user's resource returns 404.
  - Unit tests for every use case, including failure paths.
  - E2E tests for the happy path, validation, and 401/403/404/409.
  - `bun run verify` and `bun run test:e2e` both pass.
  - README and DECISIONS updated.
- Do not stop to ask between steps. Decide, record the decision in DECISIONS, and continue. Stop only for real blockers.

## 3. Daily commands

```bash
cd /Users/shiva/Desktop/sewaPro/sewaPro-nest
source ~/.nvm/nvm.sh && nvm use
bun run start:dev                      # http://localhost:3000/api/v1, Swagger at /docs
bunx prettier --write src test         # run after edits: Prettier reflows lines and long imports
bun run verify                         # format, lint, typecheck, cycles, build, unit tests
bun run test:e2e                       # applies migrations to sewapro_test, then runs the e2e suites
bun run test:cov                       # coverage (threshold 80%)
```

- Seed admin credentials: `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` (git-ignored).
- In dev, OTP codes appear in the server log.
- `/api/v1` itself returns 404 on purpose (there is no root route). Use `/docs`.

## 4. Where things are

```
src/common/       auth decorators (Public, Roles, CurrentUser, CurrentActor), DomainError,
                  envelope + pagination (offset and cursor), validation (Nepal phone, geo),
                  nepal-time, money (paisa), geo/distance, upload-policy, ports/*
src/infrastructure/ prisma (+ PrismaTransactionHost = UnitOfWork), storage (local disk + signed
                  URLs, FilesController), events (EventEmitter publisher), audit writer,
                  logger (redaction), messaging (console adapters), platform module, seed
src/modules/      auth users addresses catalog providers bookings quotations reviews
                  notifications audit disputes admin
prisma/           schema.prisma + migrations (0100 init, 0200 constraints, 0300 quotation index,
                  0400 performance indexes)
test/             *.e2e-spec.ts, utils/, unit/ (mock helpers and fixtures for unit specs)
```

Useful test helpers:

- `test/utils/create-test-app.ts`: `createTestApp({ controllers?, sensitiveThrottleLimit? })`. SMS is captured in memory, and `ctx.sms.lastCodeFor(phone)` returns the last OTP.
- `test/utils/auth.ts`: `createUser(ctx, role)` and `nextPhone()`.
- `test/utils/providers.ts`: `registerProvider`, `verifiedProvider` (offers a service, works Sun to Fri 06:00 to 20:00) and `createService`.
- `test/utils/bookings.ts`: `nepalSlot(daysAhead, hour)` (skips Saturdays), `createAddress`, `book` and `providerAction`.
- `test/utils/lifecycle.ts`: `completedBooking(...)`.
- `test/unit/mock.ts`: `mockOf<Port>()`, `FakeUnitOfWork`, `FixedClock` (2030-01-07T04:15Z), `userOf` and `actorOf`. Fixtures are in `test/unit/fixtures/*`.

## 5. Gotchas learned (save time)

1. **Never `prisma migrate reset`.** Prisma's AI safety check refuses it without the owner's explicit consent. Use `prisma migrate deploy`, which is non-destructive.
2. **New migration:** edit `schema.prisma`, then run `bun run prisma:diff > prisma/migrations/<ts>_<name>/migration.sql`. Add `CREATE EXTENSION …` lines yourself. Then run `bun run prisma:deploy` and, for the test DB, `DATABASE_URL=postgresql://shiva@localhost:5432/sewapro_test bunx prisma migrate deploy`. Then `bunx prisma generate`. **Confirm `bun run prisma:diff` prints an empty migration afterwards.** Do not use `prisma migrate dev`.
3. **Partial-index `where:` predicates** must be written the way Postgres stores them back (`a = 'x' OR a = 'y'`, not `IN (…)`), otherwise every diff shows them again.
4. **Exclusion and CHECK constraints** live in hand-written SQL (`*_constraints` migration). Prisma ignores them, which is fine.
5. A Prisma **P2002 `meta`** includes the constraint or index name, so `isUniqueViolation(error, 'slug')` works. Exclusion violations are detected by message (`isExclusionViolation`).
6. **Events are published AFTER commit.** Inside your own transaction, call `BookingTransitionService.persist(...)`, then `publish(...)` after `uow.run`. Calling `apply()` inside an outer transaction would publish too early.
7. Lint (strictTypeChecked) traps:
   - No spreading of class instances: use `Object.assign({}, this, changes)` or explicit fields.
   - No static-only classes.
   - Test utilities need explicit return types.
   - DTO response mappers must list fields one by one.
   - E2E files are exempt from the `no-unsafe-*` rules; `max-lines` is off for tests.
8. Prettier reflows imports. A scripted string replace on an import line often misses afterwards, so check before you assume it applied.
9. Express `sendFile` refuses dot-directories (the test storage is `.tmp/…`). FilesController passes `dotfiles: 'allow'`.
10. Swagger UI starts collapsed (`docExpansion: 'none'`, `defaultModelsExpandDepth: 0`, `filter: true`).
11. The heredoc parser in the shell tool can misread `$`-heavy code. Write source files with the Write tool.

## 6. Step 6 plan: Search (nearby providers)

The brief requires: `GET /providers` with filters `categoryId`, `serviceId`, `lat`/`lng`, `radiusKm`, `minRating`,
`minPrice`/`maxPrice`, `minExperience`, `verifiedOnly`, `availableOn`, `q`, `sortBy` (`distance`, `rating`
or `price`), `page` and `limit`. Use a parameterized `$queryRaw` with `ST_DWithin`/`ST_Distance` and a
**GiST** index. Return `distanceKm`. Return only VERIFIED and available providers. No N+1, and
select only the columns you need. Also add `GET /providers/:id`, a public detail with no phone or email.

Steps:

1. **Migration** `…_provider_location`:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ALTER TABLE providers ADD COLUMN location geography(Point, 4326)
     GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED;
   CREATE INDEX providers_location_gist ON providers USING gist (location);
   ```
   Add `location Unsupported("geography(Point, 4326)")?` and the GiST `@@index` to `schema.prisma` so
   `prisma:diff` stays empty. Check that, then apply to both databases and regenerate the client.
2. **`src/modules/search`**:
   - domain: `ProviderSearchFilter`, `ProviderSearchHit` (id, name, rating, count, experience, minPrice, distanceKm, services), `PublicProviderProfile`, `ProviderSearchReader` port, errors.
   - application: `SearchProvidersUseCase`. Validate that lat and lng are given together, radius is 1 to 50 km (default 10), minPrice ≤ maxPrice, and `availableOn` is a date that is not in the past. Sorting by distance needs lat/lng. Also `GetPublicProviderUseCase`.
   - infrastructure: `PrismaProviderSearchReader`. Build the query with `Prisma.sql` fragments:
     - Base filter: `p.verification_status = 'VERIFIED' AND p.is_available AND p.deleted_at IS NULL`, the owner's account is not SUSPENDED, `ST_DWithin(p.location, point, radius_m)`, and the customer is inside the provider's own `service_radius_km`.
     - Price filters use `provider_services` joined to active `services` and `categories`.
     - `availableOn` uses `availability_rules.day_of_week` (Nepal weekday) and `NOT EXISTS blocked_dates`.
     - `q` matches `business_name ILIKE` (trigram index exists) or the service name.
     - Run a separate `COUNT(*)` for pagination meta, and ORDER BY with a stable tiebreak on `id`.
   - presentation: `SearchController` (`@Public()`), query DTO (`@Type(() => Number)` and so on), response DTOs, and `@ApiPaginatedResponse`.
   - Route clash: the `providers/me` controllers are registered earlier, and `:id` uses `ParseUUIDPipe`. Make sure `GET /providers/me` still works for providers.
3. **Tests**:
   - Unit tests for the use cases.
   - E2E: distance ordering and `distanceKm`, every filter, pending/suspended/unavailable providers hidden, no contact data in the detail, 400 for bad combinations.
   - Add the search step to `test/full-flow.e2e-spec.ts`.
   - The IDOR matrix and the OpenAPI contract test must still pass.
4. **Docs**:
   - DECISIONS: add D-079 onwards, and update D-053 and D-078.
   - README: status line, modules table (`search` row), roadmap item 6.
   - This file: section 1.
   - CI already uses the `postgis/postgis:16-3.4` image.

## 7. Known limitations / later ideas

- `booking_images` table exists but has no upload endpoint (D-060).
- Throttler, cache and events are in-process. Running more than one instance needs Redis plus an outbox.
- Audit rows created from events have no IP address (D-069).
- Messaging uses console adapters (no real SMS, email or push).
- The repo has lint-staged config in both `package.json` and `.lintstagedrc.json` (pre-existing; the owner was not asked about it).
- Payments are intentionally absent; README section "Adding Payments later" explains the extension points.
