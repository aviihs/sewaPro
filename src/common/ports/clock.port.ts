/** Source of the current time; injected so time-based rules are testable. */
export abstract class Clock {
  abstract now(): Date;
}
