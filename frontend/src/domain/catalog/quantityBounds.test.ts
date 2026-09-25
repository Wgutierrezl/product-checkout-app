import { clampQuantity, maxSelectableQuantity } from './quantityBounds';

describe('maxSelectableQuantity', () => {
  it('caps at 10 when stock is higher than 10', () => {
    expect(maxSelectableQuantity(50)).toBe(10);
  });

  it('returns the stock itself when stock is 10 or fewer', () => {
    expect(maxSelectableQuantity(3)).toBe(3);
  });

  it('returns 0 when there is no stock', () => {
    expect(maxSelectableQuantity(0)).toBe(0);
  });
});

describe('clampQuantity', () => {
  it('clamps a quantity above the maximum down to the maximum', () => {
    expect(clampQuantity(99, 3)).toBe(3);
  });

  it('clamps a quantity below 1 up to 1 when stock allows it', () => {
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(-2, 5)).toBe(1);
  });

  it('passes an in-range quantity through unchanged', () => {
    expect(clampQuantity(2, 5)).toBe(2);
  });

  it('clamps down to 0 when the product is out of stock', () => {
    expect(clampQuantity(1, 0)).toBe(0);
  });

  it('rounds a non-integer quantity down before clamping', () => {
    expect(clampQuantity(2.9, 5)).toBe(2);
  });
});
