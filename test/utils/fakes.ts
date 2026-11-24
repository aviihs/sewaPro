import { SmsSender } from '../../src/common/ports/messaging.port.js';

export interface SentSms {
  readonly phone: string;
  readonly message: string;
}

/** Keeps SMS in memory so tests can read OTP codes. */
export class CapturingSmsSender extends SmsSender {
  readonly sent: SentSms[] = [];

  send(phone: string, message: string): Promise<void> {
    this.sent.push({ phone, message });
    return Promise.resolve();
  }

  lastCodeFor(phone: string): string {
    const sms = this.sent.filter((s) => s.phone === phone).at(-1);
    const code = /\b(\d{6})\b/.exec(sms?.message ?? '')?.[1];
    if (!code) throw new Error(`No OTP was sent to ${phone}`);
    return code;
  }
}
