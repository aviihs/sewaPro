import { describe, expect, it } from 'vitest';
import { maskPhone, normalizeNepalPhone } from './nepal-phone.js';

describe('normalizeNepalPhone', () => {
  it.each([
    ['9841234567', '+9779841234567'],
    ['+977 984-123-4567', '+9779841234567'],
    ['9779801234567', '+9779801234567'],
    ['9612345678', '+9779612345678'],
    ['9741234567', '+9779741234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeNepalPhone(input)).toBe(expected);
  });

  it.each(['984123456', '98412345678', '0141234567', '9541234567', '+1 202 555 0100', 'abc'])(
    'rejects %s',
    (input) => {
      expect(normalizeNepalPhone(input)).toBeNull();
    },
  );
});

describe('maskPhone', () => {
  it('keeps only the last three digits', () => {
    expect(maskPhone('+9779841234567')).toBe('***********567');
    expect(maskPhone('12')).toBe('***');
  });
});
