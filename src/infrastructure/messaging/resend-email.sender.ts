import { Logger } from '@nestjs/common';
import { EmailSender } from '../../common/ports/messaging.port.js';

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export interface ResendConfig {
  readonly apiKey: string;
  readonly from: string;
}

/**
 * Sends email through Resend's HTTP API (no SDK needed). A failed send is
 * logged, never thrown: the account or reset flow has already been saved and
 * the user can ask for a new code. Recipients are masked in the log.
 */
export class ResendEmailSender extends EmailSender {
  private readonly logger = new Logger('Email');

  constructor(
    private readonly config: ResendConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    const masked = `***${to.slice(to.indexOf('@'))}`;
    try {
      const response = await this.fetchFn(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.config.from, to: [to], subject, text: body }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.error(`to ${masked}: Resend answered ${String(response.status)}`);
        return;
      }
      this.logger.log(`to ${masked}: ${subject}`);
    } catch (error) {
      this.logger.error(`to ${masked}: ${error instanceof Error ? error.message : 'send failed'}`);
    }
  }
}
