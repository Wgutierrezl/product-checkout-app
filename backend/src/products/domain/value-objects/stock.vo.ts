import { ValidationError } from '../../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../../shared/result/result.types';
import { Quantity } from './quantity.vo';

/**
 * A non-negative integer amount of units of a product available for purchase.
 * Distinct from `Quantity` (positive integer >=1, used for order amounts):
 * stock legitimately reaches zero once a product sells out, but an order can
 * never request zero or fewer units. See design ADR-6 amendment (out-of-stock
 * products must be representable and shown as such in the catalog).
 */
export class Stock {
  private constructor(private readonly amount: number) {}

  static create(amount: number): AppResult<Stock> {
    if (!Number.isInteger(amount) || amount < 0) {
      return err(new ValidationError('Stock must be a non-negative integer'));
    }

    return ok(new Stock(amount));
  }

  get value(): number {
    return this.amount;
  }

  canFulfill(quantity: Quantity): boolean {
    return this.amount >= quantity.value;
  }
}
