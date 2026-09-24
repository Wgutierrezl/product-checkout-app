function digitsOnly(cardNumber: string): string {
  return cardNumber.replace(/\s+/g, '');
}

/** Returns the last 4 digits of a card number. */
export function getLast4(cardNumber: string): string {
  const digits = digitsOnly(cardNumber);
  return digits.slice(-4);
}

/**
 * Masks all but the last 4 digits of a card number, grouped in
 * blocks of 4 separated by spaces, e.g. "•••• •••• •••• 1234".
 */
export function maskCardNumber(cardNumber: string): string {
  const digits = digitsOnly(cardNumber);
  const last4 = getLast4(digits);
  const maskedLength = Math.max(digits.length - last4.length, 0);
  const masked = '•'.repeat(maskedLength) + last4;

  return (masked.match(/.{1,4}/g) ?? []).join(' ');
}
