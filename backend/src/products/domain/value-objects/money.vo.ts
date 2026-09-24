import { ValidationError } from '../../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../../shared/result/result.types';

/**
 * Represents a COP amount in integer cents. Never use floats for currency math —
 * see design ADR-6 (Money/Quantity as value objects, integer cents).
 */
export class Money {
  private constructor(private readonly amountCents: number) {}

  static create(amountCents: number): AppResult<Money> {
    if (!Number.isInteger(amountCents)) {
      return err(new ValidationError('Money amount must be an integer number of cents'));
    }

    if (amountCents < 0) {
      return err(new ValidationError('Money amount cannot be negative'));
    }

    return ok(new Money(amountCents));
  }

  get valueInCents(): number {
    return this.amountCents;
  }

  add(other: Money): Money {
    return new Money(this.amountCents + other.amountCents);
  }

  multiply(factor: number): AppResult<Money> {
    if (!Number.isInteger(factor) || factor < 0) {
      return err(
        new ValidationError('Money multiplication factor must be a non-negative integer'),
      );
    }

    return ok(new Money(this.amountCents * factor));
  }
}
