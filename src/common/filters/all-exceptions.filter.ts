import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type ErrorEnvelope } from '../http/envelope.js';
import { mapException } from './exception-mapper.js';

/** Single global filter: every error leaves the API in the same `{ success:false, error }` shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const mapped = mapException(exception);
    const requestId = typeof request.id === 'string' ? request.id : '';

    if (mapped.status >= 500) {
      this.logger.error(
        { err: exception, requestId, path: request.originalUrl },
        'Unhandled exception',
      );
    }

    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details === undefined ? {} : { details: mapped.details }),
        requestId,
      },
    };
    response.status(mapped.status).json(body);
  }
}
