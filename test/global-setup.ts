import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';

/** Applies all migrations to the test database once, before any e2e file runs. */
export default function setup(): void {
  config({ path: '.env.test', override: true, quiet: true });
  execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    stdio: 'pipe',
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
