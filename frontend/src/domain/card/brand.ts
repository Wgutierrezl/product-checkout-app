export type CardBrand = 'visa' | 'mastercard' | 'unknown';

/**
 * Detects the card brand from its BIN (first digits). Only Visa and
 * Mastercard are supported; anything else resolves to 'unknown'.
 */
export function detectCardBrand(cardNumber: string): CardBrand {
  const digitsOnly = cardNumber.replace(/\s+/g, '');

  if (/^4\d*/.test(digitsOnly) && digitsOnly.length >= 6) {
    return 'visa';
  }

  const firstTwo = Number(digitsOnly.slice(0, 2));
  const firstFour = Number(digitsOnly.slice(0, 4));

  if (digitsOnly.length >= 2 && firstTwo >= 51 && firstTwo <= 55) {
    return 'mastercard';
  }

  if (digitsOnly.length >= 4 && firstFour >= 2221 && firstFour <= 2720) {
    return 'mastercard';
  }

  return 'unknown';
}
