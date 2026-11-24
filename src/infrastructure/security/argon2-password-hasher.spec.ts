import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('produces a salted PHC argon2id hash that verifies', async () => {
    const first = await hasher.hash('S3cure-pass!');
    const second = await hasher.hash('S3cure-pass!');

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(first).not.toBe(second);
    expect(await hasher.verify(first, 'S3cure-pass!')).toBe(true);
  });

  it('rejects a wrong password and malformed hashes', async () => {
    const hash = await hasher.hash('S3cure-pass!');
    expect(await hasher.verify(hash, 'wrong')).toBe(false);
    expect(await hasher.verify('not-a-hash', 'S3cure-pass!')).toBe(false);
    expect(await hasher.verify('$argon2id$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA', 'x')).toBe(false);
  });
});
