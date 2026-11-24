import { Injectable, Logger } from '@nestjs/common';
import { EmailSender, PushSender, SmsSender } from '../../common/ports/messaging.port.js';
import { maskPhone } from '../../common/validation/nepal-phone.js';

/**
 * Development adapters: messages go to the application log instead of a
 * provider; recipients are masked. Outside production the SMS body is logged so
 * OTPs can be used locally; in production it never is (OTPs are secrets).
 * Replace these bindings in PlatformModule with real gateways for production.
 */
export class ConsoleSmsSender extends SmsSender {
  private readonly logger = new Logger('SMS');

  constructor(private readonly revealContent: boolean) {
    super();
  }

  send(phone: string, message: string): Promise<void> {
    const body = this.revealContent ? message : `[${message.length} chars hidden]`;
    this.logger.log(`to ${maskPhone(phone)}: ${body}`);
    return Promise.resolve();
  }
}

@Injectable()
export class ConsoleEmailSender extends EmailSender {
  private readonly logger = new Logger('Email');

  send(to: string, subject: string, _body: string): Promise<void> {
    const domain = to.slice(to.indexOf('@'));
    this.logger.log(`to ***${domain}: ${subject}`);
    return Promise.resolve();
  }
}

@Injectable()
export class ConsolePushSender extends PushSender {
  private readonly logger = new Logger('Push');

  send(userId: string, title: string, _body: string): Promise<void> {
    this.logger.log(`to user ${userId}: ${title}`);
    return Promise.resolve();
  }
}
