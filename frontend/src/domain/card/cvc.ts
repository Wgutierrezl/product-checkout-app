const CVC_LENGTH = 3;

/**
 * Validates a CVC. Both supported brands (Visa, Mastercard) use a
 * 3-digit security code.
 */
export function isValidCvc(cvc: string): boolean {
  return new RegExp(`^\\d{${CVC_LENGTH}}$`).test(cvc);
}
