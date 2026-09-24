export type DomainErrorType =
  | 'NotFound'
  | 'Validation'
  | 'InsufficientStock'
  | 'PaymentGatewayError'
  | 'Conflict'
  | 'Unexpected';

export abstract class DomainError extends Error {
  abstract readonly type: DomainErrorType;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly type: DomainErrorType = 'NotFound';
}

export class ValidationError extends DomainError {
  readonly type: DomainErrorType = 'Validation';
}

export class InsufficientStockError extends DomainError {
  readonly type: DomainErrorType = 'InsufficientStock';
}

export class PaymentGatewayError extends DomainError {
  readonly type: DomainErrorType = 'PaymentGatewayError';
}

export class ConflictError extends DomainError {
  readonly type: DomainErrorType = 'Conflict';
}

export class UnexpectedError extends DomainError {
  readonly type: DomainErrorType = 'Unexpected';
}
