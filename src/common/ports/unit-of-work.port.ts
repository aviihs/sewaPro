/**
 * Runs `work` atomically. Every repository call made inside `work`
 * (on any repository) joins the same transaction. Nested calls reuse the
 * outer transaction. Used as a DI token by application-layer use cases.
 */
export abstract class UnitOfWork {
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}
