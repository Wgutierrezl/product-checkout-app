import { HttpStatus } from '@nestjs/common';

import {
  ConflictError,
  InsufficientStockError,
  NotFoundError,
  PaymentGatewayError,
  UnauthorizedError,
  UnexpectedError,
  ValidationError,
} from './domain-error';
import { mapDomainErrorToHttpStatus } from './error-http.mapper';

describe('mapDomainErrorToHttpStatus', () => {
  it.each([
    [new NotFoundError('missing'), HttpStatus.NOT_FOUND],
    [new ValidationError('bad input'), HttpStatus.BAD_REQUEST],
    [new InsufficientStockError('no stock'), HttpStatus.CONFLICT],
    [new PaymentGatewayError('gateway down'), HttpStatus.BAD_GATEWAY],
    [new ConflictError('already settled'), HttpStatus.CONFLICT],
    [new UnauthorizedError('bad credentials'), HttpStatus.UNAUTHORIZED],
    [new UnexpectedError('boom'), HttpStatus.INTERNAL_SERVER_ERROR],
  ])('maps %p to HTTP status %i', (error, expectedStatus) => {
    expect(mapDomainErrorToHttpStatus(error)).toBe(expectedStatus);
  });
});
