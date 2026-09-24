import { BASE_FEE_CENTS, DELIVERY_FEE_CENTS, computeOrderPreview } from './orderPreview';

describe('computeOrderPreview', () => {
  it('computes productAmount as unit price times quantity', () => {
    const preview = computeOrderPreview({ unitPrice: 150_000, quantity: 2 });

    expect(preview.productAmount).toBe(300_000);
  });

  it('always uses the fixed base and delivery fee constants', () => {
    const preview = computeOrderPreview({ unitPrice: 150_000, quantity: 1 });

    expect(preview.baseFee).toBe(BASE_FEE_CENTS);
    expect(preview.deliveryFee).toBe(DELIVERY_FEE_CENTS);
  });

  it('sums productAmount + baseFee + deliveryFee into total', () => {
    const preview = computeOrderPreview({ unitPrice: 150_000, quantity: 2 });

    expect(preview.total).toBe(300_000 + BASE_FEE_CENTS + DELIVERY_FEE_CENTS);
  });

  it('exposes the fixed fee constants matching the backend defaults (2.500/8.000 COP)', () => {
    expect(BASE_FEE_CENTS).toBe(250_000);
    expect(DELIVERY_FEE_CENTS).toBe(800_000);
  });
});
