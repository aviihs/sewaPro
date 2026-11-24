import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';
import { EventEmitterPublisher } from './event-emitter.publisher.js';

/** EventEmitter2 types listeners as void-returning; emitAsync still awaits returned promises. */
const asyncListener = (fn: () => Promise<void>): (() => void) => fn;

describe('EventEmitterPublisher', () => {
  const event = (name: string) => ({ name, occurredAt: new Date() });

  it('delivers events to listeners in order and awaits them', async () => {
    const emitter = new EventEmitter2();
    const seen: string[] = [];
    emitter.on(
      'a',
      asyncListener(async () => {
        await Promise.resolve();
        seen.push('a');
      }),
    );
    emitter.on('b', () => seen.push('b'));
    await new EventEmitterPublisher(emitter).publish(event('a'), event('b'));
    expect(seen).toEqual(['a', 'b']);
  });

  it('logs listener failures without throwing and keeps delivering', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const emitter = new EventEmitter2();
    const delivered = vi.fn();
    emitter.on(
      'a',
      asyncListener(() => Promise.reject(new Error('listener down'))),
    );
    emitter.on('b', delivered);
    await expect(
      new EventEmitterPublisher(emitter).publish(event('a'), event('b')),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledOnce();
    expect(delivered).toHaveBeenCalled();
  });
});
