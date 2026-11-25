import { EmailSender, SmsSender } from '../../src/common/ports/messaging.port.js';

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

export interface SentEmail {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/** Keeps email in memory so tests can read verification and reset codes. */
export class CapturingEmailSender extends EmailSender {
  readonly sent: SentEmail[] = [];

  send(to: string, subject: string, body: string): Promise<void> {
    this.sent.push({ to, subject, body });
    return Promise.resolve();
  }

  /** The 6-digit code in the latest email to `to` (optionally with a subject match). */
  lastCodeFor(to: string, subject?: RegExp): string {
    const email = this.sent
      .filter((e) => e.to === to && (!subject || subject.test(e.subject)))
      .at(-1);
    const code = /\b(\d{6})\b/.exec(email?.body ?? '')?.[1];
    if (!code) throw new Error(`No code was emailed to ${to}`);
    return code;
  }

  countFor(to: string): number {
    return this.sent.filter((e) => e.to === to).length;
  }
}
