/** Outbound SMS. Dev adapter logs; production plugs in an SMS gateway. */
export abstract class SmsSender {
  abstract send(phone: string, message: string): Promise<void>;
}

/** Outbound email. Dev adapter logs; production plugs in an email provider. */
export abstract class EmailSender {
  abstract send(to: string, subject: string, body: string): Promise<void>;
}

/** Mobile push. Dev adapter logs; production plugs in FCM/APNs. */
export abstract class PushSender {
  abstract send(userId: string, title: string, body: string): Promise<void>;
}
