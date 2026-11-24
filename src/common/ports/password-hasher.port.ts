/** One-way password hashing. Implementations must use a slow, salted KDF. */
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  /** Constant-time verification; returns false (never throws) for malformed hashes. */
  abstract verify(hash: string, plain: string): Promise<boolean>;
}
