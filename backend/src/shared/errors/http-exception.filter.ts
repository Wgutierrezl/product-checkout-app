import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { SystemClockAdapter } from '../infrastructure/clock/system-clock.adapter';
import { ClockPort } from '../ports/clock.port';
import { DomainError, DomainErrorType } from './domain-error';
import { mapDomainErrorToHttpStatus } from './error-http.mapper';

/**
 * Generic, user-safe messages for error types that map to a 5xx response.
 * The real (potentially sensitive/internal) message is logged server-side
 * via `Logger.error` and never leaked to the client. 4xx error types are
 * intentionally absent here — their domain message is safe to return as-is.
 */
const GENERIC_MESSAGE_BY_ERROR_TYPE: Partial<Record<DomainErrorType, string>> = {
  Unexpected: 'Internal server error',
  PaymentGatewayError: 'Payment provider unavailable',
};

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  private readonly logger = new Logger(DomainErrorFilter.name);

  constructor(private readonly clock: ClockPort = new SystemClockAdapter()) {}

  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const statusCode = mapDomainErrorToHttpStatus(exception);
    const genericMessage = GENERIC_MESSAGE_BY_ERROR_TYPE[exception.type];

    if (genericMessage) {
      this.logger.error(`${exception.type}: ${exception.message}`, exception.stack);
    }

    response.status(statusCode).json({
      statusCode,
      error: exception.type,
      message: genericMessage ?? exception.message,
      path: request.url,
      timestamp: this.clock.now().toISOString(),
    });
  }
}
