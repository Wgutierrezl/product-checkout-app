import { ValidationError } from '../../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../../shared/result/result.types';

/**
 * A positive integer amount of units of a product. See design ADR-6.
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
