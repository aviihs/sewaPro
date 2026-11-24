import { defineConfig } from 'vitest/config';

/** E2E tests against a real Postgres (`.env.test`). Run via `pnpm test:e2e`. */
export default defineConfig({
  test: {
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    setupFiles: ['test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
