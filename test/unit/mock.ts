import { type Mock, vi } from 'vitest';
import { type Actor, type AuthenticatedUser, type Role } from '../../src/common/auth/role.js';
import { Clock } from '../../src/common/ports/clock.port.js';
import { UnitOfWork } from '../../src/common/ports/unit-of-work.port.js';

type Method = (...args: never[]) => unknown;

/** Every method of T replaced by a typed `vi.fn()`. */
export type Mocked<T> = {
  [K in keyof T]: T[K] extends Method ? Mock<T[K]> & T[K] : T[K];
};

/**
 * Creates a mock for an abstract class / interface port: any method accessed
 * is lazily created as `vi.fn()`. Use `vi.mocked`-style setup on the result.
 */
export function mockOf<T extends object>(): Mocked<T> & T {
  const fns = new Map<PropertyKey, Mock>();
  return new Proxy({} as Mocked<T> & T, {
    get(_target, key) {
      if (key === 'then') return undefined;
      let fn = fns.get(key);
      if (!fn) {
        fn = vi.fn();
        fns.set(key, fn);
      }
      return fn;
    },
  });
}

/** Runs work inline; records how many transactions were opened. */
export class FakeUnitOfWork extends UnitOfWork {
  runs = 0;

  run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    return work();
  }
}

export class FixedClock extends Clock {
  constructor(public current: Date = new Date('2030-01-07T04:15:00.000Z')) {
    super();
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export const userOf = (role: Role, id = `${role.toLowerCase()}-1`): AuthenticatedUser => ({
  id,
  role,
});

export const actorOf = (role: Role, id = `${role.toLowerCase()}-1`): Actor => ({
  id,
  role,
  context: { ipAddress: '127.0.0.1', userAgent: 'vitest', requestId: 'req-00000001' },
});
