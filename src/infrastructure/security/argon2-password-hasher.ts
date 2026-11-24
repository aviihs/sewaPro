import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '../../common/ports/password-hasher.port.js';

/** OWASP minimum for Argon2id: 19 MiB memory, 2 passes, 1 lane. */
export const ARGON2_PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SALT_BYTES = 16;
const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface Params {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly tagLength: number;
}

function derive(plain: string, salt: Buffer, params: Params): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: plain, nonce: salt, ...params }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

const b64 = (buffer: Buffer): string => buffer.toString('base64').replace(/=+$/, '');

/**
 * Argon2id via Node's built-in `crypto.argon2` (no native addon). Hashes use
 * the standard PHC string format, so they stay portable to other libraries.
 */
@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(plain, salt, ARGON2_PARAMS);
    const { memory, passes, parallelism } = ARGON2_PARAMS;
    return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${b64(salt)}$${b64(key)}`;
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    const match = PHC_PATTERN.exec(hash);
    if (!match) return false;
    const [, memory = '', passes = '', parallelism = '', salt = '', expectedB64 = ''] = match;
    const expected = Buffer.from(expectedB64, 'base64');
    try {
      const actual = await derive(plain, Buffer.from(salt, 'base64'), {
        memory: Number(memory),
        passes: Number(passes),
        parallelism: Number(parallelism),
        tagLength: expected.length,
      });
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
