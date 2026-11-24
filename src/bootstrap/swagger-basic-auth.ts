import { createHash, timingSafeEqual } from 'node:crypto';
import { type NextFunction, type Request, type Response } from 'express';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/** HTTP Basic guard for the docs routes in production. Constant-time comparison. */
export function swaggerBasicAuth(user: string, password: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const givenUser = decoded.slice(0, Math.max(separator, 0));
      const givenPassword = decoded.slice(separator + 1);
      const userOk = safeEqual(givenUser, user);
      const passwordOk = safeEqual(givenPassword, password);
      if (separator > 0 && userOk && passwordOk) {
        next();
        return;
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="SewaPro API docs"');
    res.status(401).send('Authentication required');
  };
}
