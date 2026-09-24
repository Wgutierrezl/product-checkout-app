const CVC_PATTERN = /^\d{3}$/;

/**
 * Validates a CVC. Both supported brands (Visa, Mastercard) use a
 * 3-digit security code.
 */
export function isValidCvc(cvc: string): boolean {
  return CVC_PATTERN.test(cvc);
}
