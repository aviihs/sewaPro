# SewaPro API: notes for Claude

Before doing anything, read **`docs/HANDOFF.md`**. It has:

- the current status (all twelve steps done)
- the owner's standing rules
- the daily commands
- the gotchas learned so far
- a summary of the search module (Step 6)

Then read `docs/DECISIONS.md` and the README as needed.

Essentials:

- Bun only (never npm, pnpm or yarn).
- Node 24 via `nvm use`.
- No Docker.
- No payments, chat, live tracking or AI.
- Clean Architecture is enforced by ESLint.
- `bun run verify` and `bun run test:e2e` must pass before a step is called done.
- Never run `prisma migrate reset`.
- Commit only when asked.
