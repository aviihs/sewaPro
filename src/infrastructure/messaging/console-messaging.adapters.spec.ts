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

  it('logs email bodies only outside production, masking the address', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new ConsoleEmailSender(true).send('ram@example.com', 'Verify', 'Code:\n123456');
    await new ConsoleEmailSender(false).send('ram@example.com', 'Verify', 'Code:\n123456');
    expect(log.mock.calls.map(([message]) => String(message))).toEqual([
      'to ***@example.com: Verify | Code: 123456',
      'to ***@example.com: Verify',
    ]);
  });

  it('logs only the subject/title in production and for push', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new ConsoleEmailSender(false).send('ram@example.com', 'Welcome', 'secret body');
    await new ConsolePushSender().send('user-1', 'Booking accepted', 'secret body');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret body');
    expect(JSON.stringify(log.mock.calls)).not.toContain('ram@');
  });
});
