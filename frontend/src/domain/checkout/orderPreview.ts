/**
 * Fixed fee constants, in integer cents, matching the backend's configured
 * defaults (`BASE_FEE_CENTS`/`DELIVERY_FEE_CENTS`, both env-configurable
 * server-side). Used ONLY to render a client-side preview on the SUMMARY
 * screen before a transaction exists — the actual amounts on `Transaction`
 * (after `POST /transactions` succeeds) are always the authoritative
 * source of truth and MUST be shown instead of this preview once available.
 */
export const BASE_FEE_CENTS = 250_000;
export const DELIVERY_FEE_CENTS = 800_000;

export interface OrderPreviewInput {
  /** Unit price, in integer cents. */
  unitPrice: number;
  quantity: number;
}

export interface OrderPreview {
  productAmount: number;
  baseFee: number;
  deliveryFee: number;
  total: number;
}

/** Client-side estimate of the order breakdown, in integer cents. */
export function computeOrderPreview({ unitPrice, quantity }: OrderPreviewInput): OrderPreview {
  const productAmount = unitPrice * quantity;

  return {
    productAmount,
    baseFee: BASE_FEE_CENTS,
    deliveryFee: DELIVERY_FEE_CENTS,
    total: productAmount + BASE_FEE_CENTS + DELIVERY_FEE_CENTS,
  };
}
