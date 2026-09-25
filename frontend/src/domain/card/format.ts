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

const EXPIRY_YEAR_DIGITS = 2;

/**
 * Formats raw expiry input for display WHILE the buyer is typing (or
 * pasting): strips anything that isn't a digit and auto-inserts the "/"
 * once a 3rd digit is entered. Pure and idempotent — feeding it its own
 * previous output (plus/minus a character) always produces the correctly
 * reformatted next value, so the caller never needs to track cursor
 * position or typing direction:
 *
 * - "1229"        -> "12/29"  (typed digits only)
 * - "12/29"       -> "12/29"  (already formatted / re-typed as-is)
 * - "12/2029"     -> "12/29"  (a pasted 4-digit year keeps its last 2 digits)
 * - "12 / 2029"   -> "12/29"  (stray separators/spaces are ignored)
 * - "4"           -> "04/"    (a leading digit that can't start a 2nd month
 *                               digit, e.g. 2-9, is auto-completed to "0X/")
 * - "12/" (after a backspace removed the 3rd digit) -> "12" (the
 *   auto-inserted slash disappears along with it, so backspacing feels
 *   natural instead of getting the buyer "stuck" on a trailing slash)
 */
export function formatExpiryInput(rawValue: string): string {
  const digits = digitsOnly(rawValue);

  if (digits.length <= EXPIRY_YEAR_DIGITS) {
    if (digits.length === 1 && Number(digits) > 1) {
      return `0${digits}/`;
    }
    return digits;
  }

  const month = digits.slice(0, EXPIRY_YEAR_DIGITS);
  const yearDigits = digits.slice(EXPIRY_YEAR_DIGITS);
  const year = yearDigits.length > EXPIRY_YEAR_DIGITS ? yearDigits.slice(-EXPIRY_YEAR_DIGITS) : yearDigits;

  return `${month}/${year}`;
}
