import { HttpStatus } from '@nestjs/common';

import { DomainError, DomainErrorType } from './domain-error';

const STATUS_BY_ERROR_TYPE: Record<DomainErrorType, number> = {
  NotFound: HttpStatus.NOT_FOUND,
  Validation: HttpStatus.BAD_REQUEST,
  InsufficientStock: HttpStatus.CONFLICT,
  PaymentGatewayError: HttpStatus.BAD_GATEWAY,
  Conflict: HttpStatus.CONFLICT,
  Unexpected: HttpStatus.INTERNAL_SERVER_ERROR,
};

export function mapDomainErrorToHttpStatus(error: DomainError): number {
  return STATUS_BY_ERROR_TYPE[error.type];
}
