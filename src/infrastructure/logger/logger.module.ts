import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../../config/app-config.service.js';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const UNLOGGED_PATHS = /\/health(\/|$)/;

/** Query strings that carry credentials (signed file URLs) are never written to logs. */
const SENSITIVE_QUERY_PATHS = /\/files\//;

export function loggableUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1 || !SENSITIVE_QUERY_PATHS.test(url.slice(0, queryStart))) return url;
  return `${url.slice(0, queryStart)}?[REDACTED]`;
}

/** Reuses a well-formed inbound X-Request-Id, otherwise generates one; echoes it back. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const id = typeof inbound === 'string' && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: resolveRequestId,
          autoLogging: { ignore: (req) => UNLOGGED_PATHS.test(req.url ?? '') },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["idempotency-key"]',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: loggableUrl(req.url),
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          ...(config.logPretty
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
  ],
})
export class LoggerModule {}
