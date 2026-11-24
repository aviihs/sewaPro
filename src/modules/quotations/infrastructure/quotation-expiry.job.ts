import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExpireQuotationsUseCase } from '../application/provider-quotations.use-cases.js';

/**
 * Every minute, SENT quotations past `expires_at` become EXPIRED (single
 * UPDATE on the `(status, expires_at)` index). Acceptance also checks expiry
 * itself, so the job's delay can never let an expired quote through.
 */
@Injectable()
export class QuotationExpiryJob {
  private readonly logger = new Logger(QuotationExpiryJob.name);

  constructor(private readonly expireQuotations: ExpireQuotationsUseCase) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'quotation-expiry' })
  async run(): Promise<void> {
    try {
      const expired = await this.expireQuotations.execute();
      if (expired > 0) this.logger.log(`Expired ${expired} quotation(s)`);
    } catch (error) {
      this.logger.error({ err: error }, 'Quotation expiry job failed');
    }
  }
}
