const GROUP_SIZE = 4;
/** Generous upper bound covering every major card network's PAN length. */
const MAX_DIGITS = 19;

/** Strips every non-digit character. The single shared implementation — do not copy this regex inline elsewhere. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Formats raw card-number input for display WHILE the buyer is typing:
 * strips anything that isn't a digit (pasted dashes, existing spaces) and
 * regroups into blocks of 4. Unlike `mask.ts`, nothing here is hidden —
 * this is for the live input field, not a stored/summary display.
 */
export function formatCardNumberInput(rawValue: string): string {
  const digits = digitsOnly(rawValue).slice(0, MAX_DIGITS);
  const groups: string[] = [];

  for (let i = 0; i < digits.length; i += GROUP_SIZE) {
    groups.push(digits.slice(i, i + GROUP_SIZE));
  }

  return groups.join(' ');
}
