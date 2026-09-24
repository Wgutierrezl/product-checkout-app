import { Quantity } from './quantity.vo';

describe('Quantity', () => {
  it('creates a Quantity from a positive integer', () => {
    const result = Quantity.create(3);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toBe(3);
  });

  it('rejects zero', () => {
    const result = Quantity.create(0);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('rejects a negative integer', () => {
    const result = Quantity.create(-1);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('rejects a non-integer', () => {
    const result = Quantity.create(1.5);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });
});
