import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { DomainError } from './domain-error';
import { mapDomainErrorToHttpStatus } from './error-http.mapper';

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const statusCode = mapDomainErrorToHttpStatus(exception);

    response.status(statusCode).json({
      statusCode,
      error: exception.type,
      message: exception.message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
