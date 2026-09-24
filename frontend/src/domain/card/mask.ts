const GROUP_SIZE = 4;

function digitsOnly(cardNumber: string): string {
  return cardNumber.replace(/\s+/g, '');
}

function lastDigits(digits: string, count: number): string {
  return digits.slice(-count);
}

function chunk(value: string, size: number): string[] {
  const groups: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    groups.push(value.slice(i, i + size));
  }
  return groups;
}

/** Returns the last 4 digits of a card number. */
export function getLast4(cardNumber: string): string {
  return lastDigits(digitsOnly(cardNumber), GROUP_SIZE);
}

/**
 * Masks all but the trailing 4 digits, grouped in blocks of 4
 * separated by spaces, e.g. "•••• •••• •••• 1234". The trailing
 * group of up to 4 digits is always shown as-is; input shorter than
 * a full group (fewer than 4 digits) is fully masked instead of
 * revealing partial digits while the buyer is still typing.
 */
export function maskCardNumber(cardNumber: string): string {
  const digits = digitsOnly(cardNumber);

  if (digits.length < GROUP_SIZE) {
    return '•'.repeat(digits.length);
  }

  const visible = lastDigits(digits, GROUP_SIZE);
  const maskedLength = digits.length - GROUP_SIZE;
  const masked = '•'.repeat(maskedLength) + visible;

  return chunk(masked, GROUP_SIZE).join(' ');
}
