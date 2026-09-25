const MAX_QUANTITY_PER_ORDER = 10;

/** The highest quantity the buyer may select for a product, given its stock. */
export function maxSelectableQuantity(stock: number): number {
  return Math.min(MAX_QUANTITY_PER_ORDER, stock);
}

/**
 * Clamps a candidate quantity into the selectable range `1..min(10, stock)`.
 * A product with no stock at all clamps to `0` (nothing is selectable).
 * Non-integer input is floored before clamping.
 */
export function clampQuantity(quantity: number, stock: number): number {
  const max = maxSelectableQuantity(stock);
  if (max <= 0) {
    return 0;
  }

  const floored = Math.floor(quantity);
  return Math.min(max, Math.max(1, floored));
}
