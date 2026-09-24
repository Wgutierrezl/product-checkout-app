import { Quantity } from './quantity.vo';
import { Stock } from './stock.vo';

describe('Stock', () => {
  it('creates a Stock from a non-negative integer', () => {
    const result = Stock.create(10);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toBe(10);
  });

  it('allows zero (out of stock)', () => {
    const result = Stock.create(0);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toBe(0);
  });

  it('rejects a negative amount', () => {
    const result = Stock.create(-1);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('rejects a non-integer amount', () => {
    const result = Stock.create(1.5);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  describe('canFulfill', () => {
    it('returns true when stock covers the requested quantity', () => {
      const stock = Stock.create(10)._unsafeUnwrap();
      const quantity = Quantity.create(5)._unsafeUnwrap();

      expect(stock.canFulfill(quantity)).toBe(true);
    });

    it('returns true when stock exactly equals the requested quantity', () => {
      const stock = Stock.create(5)._unsafeUnwrap();
      const quantity = Quantity.create(5)._unsafeUnwrap();

      expect(stock.canFulfill(quantity)).toBe(true);
    });

    it('returns false when stock is lower than the requested quantity', () => {
      const stock = Stock.create(2)._unsafeUnwrap();
      const quantity = Quantity.create(5)._unsafeUnwrap();

      expect(stock.canFulfill(quantity)).toBe(false);
    });

    it('returns false for a zero stock (out of stock)', () => {
      const stock = Stock.create(0)._unsafeUnwrap();
      const quantity = Quantity.create(1)._unsafeUnwrap();

      expect(stock.canFulfill(quantity)).toBe(false);
    });
  });
});
