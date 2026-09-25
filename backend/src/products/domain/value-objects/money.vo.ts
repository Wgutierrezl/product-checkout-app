import { ValidationError } from '../../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../../shared/result/result.types';

/**
 * Represents a COP amount in integer cents. Never use floats for currency math —
 * floating-point arithmetic cannot represent many decimal amounts exactly.
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

  add(other: Money): AppResult<Money> {
    const sum = this.amountCents + other.amountCents;

    if (!Number.isSafeInteger(sum)) {
      return err(new ValidationError('Money addition result exceeds the safe integer range'));
    }

    return ok(new Money(sum));
  }

  multiply(factor: number): AppResult<Money> {
    if (!Number.isInteger(factor) || factor < 0) {
      return err(
        new ValidationError('Money multiplication factor must be a non-negative integer'),
      );
    }

    const product = this.amountCents * factor;

    if (!Number.isSafeInteger(product)) {
      return err(
        new ValidationError('Money multiplication result exceeds the safe integer range'),
      );
    }

    return ok(new Money(product));
  }
}
