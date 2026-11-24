import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  ConsoleEmailSender,
  ConsolePushSender,
  ConsoleSmsSender,
} from './console-messaging.adapters.js';

describe('console messaging adapters', () => {
  it('logs SMS bodies outside production and hides them in production, masking the number', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new ConsoleSmsSender(true).send('+9779841234567', 'Your code is 123456');
    await new ConsoleSmsSender(false).send('+9779841234567', 'Your code is 123456');
    expect(log.mock.calls.map(([message]) => String(message))).toEqual([
      'to ***********567: Your code is 123456',
      'to ***********567: [19 chars hidden]',
    ]);
  });

  it('logs only the subject/title for email and push', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new ConsoleEmailSender().send('ram@example.com', 'Welcome', 'secret body');
    await new ConsolePushSender().send('user-1', 'Booking accepted', 'secret body');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret body');
    expect(JSON.stringify(log.mock.calls)).not.toContain('ram@');
  });
});
