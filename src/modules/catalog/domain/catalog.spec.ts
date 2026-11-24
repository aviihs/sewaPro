import { describe, expect, it } from 'vitest';
import { removalOutcome } from './catalog.js';

describe('removalOutcome', () => {
  it('deactivates entries still offered by providers and deletes unused ones', () => {
    expect(removalOutcome(true)).toBe('DEACTIVATED');
    expect(removalOutcome(false)).toBe('DELETED');
  });
});
