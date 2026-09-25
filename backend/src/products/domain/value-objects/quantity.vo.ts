import { ValidationError } from '../../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../../shared/result/result.types';

/**
 * A positive integer amount of units of a product. An order must request at
 * least one whole unit, so zero, negative and fractional values are rejected.
 */
export class Quantity {
  private constructor(private readonly amount: number) {}

  static create(amount: number): AppResult<Quantity> {
    if (!Number.isInteger(amount) || amount < 1) {
      return err(new ValidationError('Quantity must be a positive integer'));
    }

    return ok(new Quantity(amount));
  }

  get value(): number {
    return this.amount;
  }
}
