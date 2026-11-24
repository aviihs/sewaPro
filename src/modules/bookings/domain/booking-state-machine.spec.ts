import { describe, expect, it } from 'vitest';
import { type ActorRole } from '../../../common/auth/role.js';
import {
  BookingStateMachine,
  BookingStatus,
  bookingStateMachine,
} from './booking-state-machine.js';
import {
  BookingTransitionForbiddenError,
  InvalidBookingTransitionError,
} from './bookings.errors.js';

const STATUSES = Object.values(BookingStatus);
const ACTORS: ActorRole[] = ['CUSTOMER', 'PROVIDER', 'ADMIN', 'SYSTEM'];

/** Written independently of the production table, from the product rules. */
const LEGAL: readonly (readonly [BookingStatus, BookingStatus, readonly ActorRole[]])[] = [
  ['PENDING', 'ACCEPTED', ['PROVIDER', 'SYSTEM']],
  ['PENDING', 'REJECTED', ['PROVIDER']],
  ['PENDING', 'CANCELLED', ['CUSTOMER', 'ADMIN']],
  ['ACCEPTED', 'ON_THE_WAY', ['PROVIDER']],
  ['ACCEPTED', 'CANCELLED', ['CUSTOMER', 'ADMIN']],
  ['ON_THE_WAY', 'IN_PROGRESS', ['PROVIDER']],
  ['IN_PROGRESS', 'COMPLETED', ['PROVIDER']],
  ['IN_PROGRESS', 'DISPUTED', ['CUSTOMER', 'PROVIDER']],
  ['COMPLETED', 'DISPUTED', ['CUSTOMER', 'PROVIDER']],
  ['DISPUTED', 'COMPLETED', ['ADMIN']],
  ['DISPUTED', 'CANCELLED', ['ADMIN']],
];

const allowedActors = (from: BookingStatus, to: BookingStatus): readonly ActorRole[] | undefined =>
  LEGAL.find(([f, t]) => f === from && t === to)?.[2];

const cases = STATUSES.flatMap((from) =>
  STATUSES.flatMap((to) => ACTORS.map((actor) => [from, to, actor] as const)),
);

describe('BookingStateMachine', () => {
  it('covers all 256 status/status/actor combinations', () => {
    expect(cases).toHaveLength(8 * 8 * 4);
  });

  it.each(cases)('%s → %s by %s', (from, to, actor) => {
    const actors = allowedActors(from, to);
    const act = () => {
      bookingStateMachine.assert(from, to, actor);
    };

    expect(bookingStateMachine.isLegal(from, to)).toBe(actors !== undefined);
    expect(bookingStateMachine.canPerform(from, to, actor)).toBe(actors?.includes(actor) ?? false);
    if (actors === undefined) expect(act).toThrow(InvalidBookingTransitionError);
    else if (!actors.includes(actor)) expect(act).toThrow(BookingTransitionForbiddenError);
    else expect(act).not.toThrow();
  });

  it('never lets a customer complete a booking', () => {
    for (const from of STATUSES) {
      expect(bookingStateMachine.canPerform(from, 'COMPLETED', 'CUSTOMER')).toBe(false);
    }
  });

  it('lists targets and terminal states', () => {
    expect(bookingStateMachine.targetsFrom('PENDING').sort()).toEqual([
      'ACCEPTED',
      'CANCELLED',
      'REJECTED',
    ]);
    expect(STATUSES.filter((s) => bookingStateMachine.isTerminal(s)).sort()).toEqual([
      'CANCELLED',
      'REJECTED',
    ]);
  });

  it('can run on a custom table', () => {
    const machine = new BookingStateMachine({
      PENDING: { CANCELLED: ['ADMIN'] },
      ACCEPTED: {},
      REJECTED: {},
      CANCELLED: {},
      ON_THE_WAY: {},
      IN_PROGRESS: {},
      COMPLETED: {},
      DISPUTED: {},
    });
    expect(machine.canPerform('PENDING', 'CANCELLED', 'ADMIN')).toBe(true);
    expect(machine.isLegal('PENDING', 'ACCEPTED')).toBe(false);
  });
});
