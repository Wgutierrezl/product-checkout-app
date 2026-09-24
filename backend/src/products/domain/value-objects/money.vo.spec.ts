import { Money } from './money.vo';

describe('Money', () => {
  it('creates a Money from a non-negative integer cents amount', () => {
    const result = Money.create(250_000);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().valueInCents).toBe(250_000);
  });

  it('rejects a negative amount', () => {
    const result = Money.create(-1);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('rejects a non-integer amount', () => {
    const result = Money.create(10.5);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('adds two Money instances', () => {
    const a = Money.create(1_000)._unsafeUnwrap();
    const b = Money.create(500)._unsafeUnwrap();

    expect(a.add(b).valueInCents).toBe(1_500);
  });

  it('multiplies by a positive integer factor', () => {
    const price = Money.create(2_000)._unsafeUnwrap();

    const result = price.multiply(3);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().valueInCents).toBe(6_000);
  });

  it('multiplies by zero to yield zero', () => {
    const price = Money.create(2_000)._unsafeUnwrap();

    expect(price.multiply(0)._unsafeUnwrap().valueInCents).toBe(0);
  });

  it('rejects multiplying by a negative factor', () => {
    const price = Money.create(2_000)._unsafeUnwrap();

    const result = price.multiply(-2);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('rejects multiplying by a non-integer factor', () => {
    const price = Money.create(2_000)._unsafeUnwrap();

    const result = price.multiply(1.5);

    expect(result.isErr()).toBe(true);
  });
});
