import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ResendEmailSender } from './resend-email.sender.js';

const config = { apiKey: 're_test_key', from: 'SewaPro <no-reply@sewapro.test>' };

describe('ResendEmailSender', () => {
  it('posts the message to Resend with the API key', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    await new ResendEmailSender(config, fetchFn).send('ram@example.com', 'Verify', 'Code 123456');

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer re_test_key' });
    expect(JSON.parse(init?.body as string)).toEqual({
      from: config.from,
      to: ['ram@example.com'],
      subject: 'Verify',
      text: 'Code 123456',
    });
  });

  it('logs failures without throwing or leaking the address', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const failing = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 422 }));
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error('network down'));

    await expect(
      new ResendEmailSender(config, failing).send('ram@example.com', 'S', 'B'),
    ).resolves.toBeUndefined();
    await expect(
      new ResendEmailSender(config, offline).send('ram@example.com', 'S', 'B'),
    ).resolves.toBeUndefined();
    expect(error.mock.calls.map(([m]) => String(m))).toEqual([
      'to ***@example.com: Resend answered 422',
      'to ***@example.com: network down',
    ]);
  });
});
