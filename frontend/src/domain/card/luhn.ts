/**
 * Validates a card number against the Luhn checksum algorithm.
 * Accepts digits with whitespace separators (e.g. "4111 1111 1111 1111").
 */
export function isValidLuhn(cardNumber: string): boolean {
  const digitsOnly = cardNumber.replace(/\s+/g, '');

  if (digitsOnly.length === 0 || !/^\d+$/.test(digitsOnly)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = Number(digitsOnly[i]);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}
