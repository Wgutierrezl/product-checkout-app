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

  /**
   * `true` when it is unknown whether the gateway actually processed the
   * request (timeout, network error, 5xx, or a malformed body after an
   * otherwise-successful HTTP response) — the caller must NOT assume the
   * charge failed. `false` (default) means the gateway explicitly rejected
   * the request before processing it (e.g. a 4xx validation error) — safe to
   * treat as a definite, terminal failure.
   */
  constructor(message: string, readonly ambiguous: boolean = false) {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly type: DomainErrorType = 'Conflict';
}

export class UnexpectedError extends DomainError {
  readonly type: DomainErrorType = 'Unexpected';
}
