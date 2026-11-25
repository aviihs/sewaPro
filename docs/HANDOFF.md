# SewaPro: Session Handoff

Read this first in a new session. Then read `README.md` (overview, modules) and
`docs/DECISIONS.md` (every decision and why, D-001 to D-089).

Last updated: 2026-11-25 (auth v2: email verification, D-088 and D-089).

## 1. Status

| Step | What                                                                           | State |
| ---- | ------------------------------------------------------------------------------ | ----- |
| 1    | Scaffold, config, Prisma, lint, Swagger, common layer                          | ✅    |
| 2    | Schema (23 models), migrations, constraints, seed                              | ✅    |
| 3    | Auth (password + email verification, JWT + rotating refresh), users, addresses | ✅    |
| 4    | Catalog: categories and services, admin CRUD                                   | ✅    |
| 5    | Providers, KYC documents, availability, admin verification                     | ✅    |
| 6    | Nearby search (PostGIS)                                                        | ✅    |
| 7    | Bookings, state machine, history, events                                       | ✅    |
| 8    | Quotations and the expiry job                                                  | ✅    |
| 9    | Reviews and rating recompute                                                   | ✅    |
| 10   | Notifications, audit, disputes                                                 | ✅    |
| 11   | Admin dashboard, reports, users, bookings                                      | ✅    |
| 12   | Hardening, security and OpenAPI tests, full flow                               | ✅    |

Last green run: `bun run verify` passed with **598 unit tests**, `bun run test:e2e`
passed with **118 e2e tests (15 files)**, and `bun run qa:all` passed with 10,470 assertions over 101 operations.
Nothing is committed to git. Only commit when the owner asks.

**All twelve steps are done.** There is no planned next job; see section 7 for ideas.

## 2. Standing rules (from the owner, never break)

- **Bun only** (`bun install`, `bun run`, `bunx`). Never npm, pnpm or yarn.
- The app and tests run on **Node 24**: `source ~/.nvm/nvm.sh && nvm use`.
- **No Docker.** PostgreSQL **18** + PostGIS 3.7 run on the host (Homebrew `postgresql@18`, `postgis`). Databases: `sewapro` (dev) and `sewapro_test` (e2e). PostgreSQL 16 is still installed but stopped; its data was dumped to `.tmp/sewapro-pg16.dump` and restored into 18.
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
bun run qa:all                         # Postman/Newman suite on :3100 against sewapro_test (see qa/README.md)
```

- Seed admin credentials: `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` (git-ignored).
- In dev, email codes (verification, password reset) appear in the server log. Real email: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (D-089; the owner will set these later).
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

- `test/utils/create-test-app.ts`: `createTestApp({ controllers?, sensitiveThrottleLimit? })`. SMS and email are captured in memory; `ctx.email.lastCodeFor(email, /Verify|Reset/)` returns the last emailed code. `verifyEmail(ctx, email)` in `test/utils/auth.ts` confirms it and returns the session.
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
12. **Generated columns and `prisma:diff`:** Prisma reads a `GENERATED ALWAYS AS` expression as a default. `providers.location` therefore carries `@default(dbgenerated("…"))` with the expression exactly as `pg_get_expr` prints it; otherwise every diff tries to `DROP DEFAULT`.
13. `psql` on PATH is still the 16 client (`/opt/homebrew/bin/psql`). It talks to the 18 server fine; for `pg_dump`/`pg_restore` use `/opt/homebrew/opt/postgresql@18/bin/…`.
14. Disk space is tight. Homebrew's PostGIS pulls in gdal, poppler, numpy and a Python (about 2 GB).

## 6. Search (Step 6) at a glance

- `src/modules/search`: `GET /providers` (public, filters, pagination) and `GET /providers/:id` (public profile, no contact data). Decisions D-079 to D-085.
- SQL lives in `search/infrastructure/provider-search.sql.ts` (`Prisma.sql` fragments, all values bound). One page query with `json_agg` offerings plus one `COUNT(DISTINCT)` query.
- `providers.location` is a generated `geography(Point, 4326)` with GiST index `providers_location_gist` (migration `20261124000500_provider_location`).
- `SearchModule` must stay after `ProvidersModule` in `AppModule` so `/providers/me…` wins over `/providers/:id`.
- Tests: `src/modules/search/application/search.use-cases.spec.ts`, `test/search.e2e-spec.ts`, and the search leg in `test/full-flow.e2e-spec.ts`.
- CI uses `postgis/postgis:18-3.6`.

## 7. Known limitations / later ideas

- **QA suite found 6 defects, none fixed yet (owner decides): see `qa/BUGS.md`.** The important one is
  BUG-001: the local PostgreSQL `timezone` is `Asia/Kathmandu`, and timestamps the app writes are stored
  5 h 45 m off. Because of it, `test/admin.e2e-spec.ts` (booking report) **fails when run between 00:00 and
  05:45 NPT**. The suggested fix is a one-line UTC session pin in `PrismaService`.

- `booking_images` table exists but has no upload endpoint (D-060).
- Throttler, cache and events are in-process. Running more than one instance needs Redis plus an outbox.
- Audit rows created from events have no IP address (D-069).
- Messaging uses console adapters for SMS and push; email has a Resend adapter (off until the env is set).
- **Auth v2 (D-088):** registration emails a code and gives no session until `POST /auth/verify-email`. Phone-OTP login was removed; phone is stored unverified and phone verification is planned later. Social login and account deletion (Taskify has them) are not done yet.
- The repo has lint-staged config in both `package.json` and `.lintstagedrc.json` (pre-existing; the owner was not asked about it).
- Payments are intentionally absent; README section "Adding Payments later" explains the extension points.
