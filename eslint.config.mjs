// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const PRISMA_IMPORT_PATTERNS = [
  {
    group: ['@prisma/*', '**/infrastructure/prisma/generated/**'],
    message: 'Prisma may only be imported inside an infrastructure/ layer.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'src/infrastructure/prisma/generated/**',
      'eslint.config.mjs',
      'vitest.config.ts',
      'vitest.config.e2e.ts',
      // Postman sandbox code (not Node): checked by running the collection.
      'qa/postman/sandbox/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      // Nest DTOs are classes, and mappers legitimately return plain objects typed as them.
      '@typescript-eslint/no-unsafe-class-instance-assignment': 'off',
    },
  },
  {
    // Nest DI resolves constructor parameter types from emitted metadata, so
    // injected classes must stay value imports.
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Clean Architecture: domain is framework-free and persistence-free.
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...PRISMA_IMPORT_PATTERNS,
            { group: ['@nestjs/*'], message: 'Domain layer must not depend on NestJS.' },
            {
              group: ['**/application/**', '**/infrastructure/**', '**/presentation/**'],
              message: 'Domain layer must not depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...PRISMA_IMPORT_PATTERNS,
            {
              group: ['**/infrastructure/**', '**/presentation/**'],
              message: 'Application layer depends only on domain and ports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/*/presentation/**/*.ts', 'src/common/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: PRISMA_IMPORT_PATTERNS }],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      'max-lines': 'off',
    },
  },
  {
    // Supertest response bodies are untyped JSON.
    files: ['test/**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
);
