const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/**
 * Formats an integer amount of cents as a COP currency string.
 * Amounts throughout the app are stored in cents to avoid float
 * rounding issues; this is the single formatting point for display.
 */
export function formatCOP(cents: number): string {
  return COP_FORMATTER.format(cents / 100);
}
