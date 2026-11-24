import { defineConfig } from 'vitest/config';

/** Unit tests (no database). Run via `pnpm test` / `pnpm test:cov`. */
export default defineConfig({
  test: {
    root: './',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/modules/*/domain/**/*.ts',
        'src/modules/*/application/**/*.ts',
        'src/common/**/*.ts',
        'src/config/**/*.ts',
      ],
      exclude: ['**/*.spec.ts', 'src/common/decorators/**', 'src/common/dto/**', '**/*.module.ts'],
      thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
    },
  },
});
