import { describe, expect, it } from 'vitest';
import { addRupees, fromPaisa, toPaisa } from './money.js';

describe('money', () => {
  it('adds without floating point drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(addRupees(0.1, 0.2)).toBe(0.3);
    expect(addRupees(1500.55, 349.45)).toBe(1850);
    expect(addRupees()).toBe(0);
  });

  it('converts between rupees and paisa', () => {
    expect(toPaisa(12.34)).toBe(1234);
    expect(fromPaisa(1234)).toBe(12.34);
    expect(() => toPaisa(Number.NaN)).toThrow(RangeError);
  });
});
