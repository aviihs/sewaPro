import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slugify.js';

describe('slugify', () => {
  it.each([
    ['AC Gas Refill & Repair', 'ac-gas-refill-and-repair'],
    ['  Électricien  ', 'electricien'],
    ['Plumber!!!', 'plumber'],
    ['---', ''],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps the length without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(89)} b`);
    expect(slug.length).toBeLessThanOrEqual(90);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('appends a counter until the slug is free', async () => {
    const taken = new Set(['plumber', 'plumber-2']);
    expect(await uniqueSlug('Plumber', (s) => Promise.resolve(taken.has(s)))).toBe('plumber-3');
  });

  it('falls back to "item" for empty input', async () => {
    expect(await uniqueSlug('!!!', () => Promise.resolve(false))).toBe('item');
  });
});
