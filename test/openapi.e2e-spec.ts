import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestContext, createTestApp } from './utils/create-test-app.js';

interface Operation {
  readonly tags?: string[];
  readonly summary?: string;
  readonly security?: unknown[];
  readonly requestBody?: { content: Record<string, unknown> };
  readonly responses: Record<string, unknown>;
}

type Doc = { paths: Record<string, Record<string, Operation>> };

/** Enforces the documentation part of the definition of done on every route. */
describe('OpenAPI contract (e2e)', () => {
  let ctx: TestContext;
  let doc: Doc;
  const operations = (): [string, Operation][] =>
    Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]): [string, Operation] => [
        `${method.toUpperCase()} ${path}`,
        op,
      ]),
    );

  beforeAll(async () => {
    ctx = await createTestApp();
    doc = (await ctx.http().get('/docs-json').expect(200)).body as Doc;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('documents a meaningful number of routes', () => {
    expect(operations().length).toBeGreaterThan(80);
  });

  it('gives every operation a tag, a summary and a success response', () => {
    const missing = operations().filter(
      ([, op]) =>
        !op.tags?.length ||
        !op.summary ||
        !Object.keys(op.responses).some((s) => s.startsWith('2')),
    );
    expect(missing.map(([name]) => name)).toEqual([]);
  });

  it('documents 401 and 403 on every bearer-protected route', () => {
    const missing = operations().filter(
      ([, op]) => op.security && !(op.responses['401'] && op.responses['403']),
    );
    expect(missing.map(([name]) => name)).toEqual([]);
  });

  it('documents 400 and 404 on every route with an id parameter', () => {
    const missing = operations().filter(
      ([name, op]) =>
        /\{[A-Za-z]*[iI]d\}/.test(name) && !(op.responses['400'] && op.responses['404']),
    );
    expect(missing.map(([name]) => name)).toEqual([]);
  });

  it('documents 400 on every route with a request body', () => {
    const missing = operations().filter(([, op]) => op.requestBody && !op.responses['400']);
    expect(missing.map(([name]) => name)).toEqual([]);
  });

  it('never exposes password hashes or raw tokens in schemas', () => {
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/passwordHash|tokenHash|codeHash|storageKey/);
  });
});
