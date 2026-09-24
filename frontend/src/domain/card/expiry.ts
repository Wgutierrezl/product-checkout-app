const TWO_DIGIT_YEAR_THRESHOLD = 100;
const TWO_DIGIT_YEAR_CENTURY = 2000;

/** Normalizes a 2-digit year (e.g. 27) to its 4-digit form (2027). */
export function normalizeExpiryYear(year: number): number {
  return year < TWO_DIGIT_YEAR_THRESHOLD
    ? TWO_DIGIT_YEAR_CENTURY + year
    : year;
}

/**
 * Validates a card's expiry month/year against the current month.
 * A card is valid through the LAST day of its expiry month. Accepts
 * either a 2-digit or 4-digit year.
 */
export function isExpiryValid(
  month: number,
  year: number,
  now: Date = new Date(),
): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return false;
  }

  const normalizedYear = normalizeExpiryYear(year);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (normalizedYear > currentYear) {
    return true;
  }

  if (normalizedYear === currentYear) {
    return month >= currentMonth;
  }

  return false;
}

export interface ParsedExpiry {
  month: number;
  year: number;
}

const EXPIRY_STRING_PATTERN = /^(\d{1,2})\/(\d{2}|\d{4})$/;

/**
 * Parses an "MM/YY" or "MM/YYYY" expiry string as typically entered
 * in a payment form. Returns `null` for malformed input; does NOT
 * validate whether the resulting month/year is expired — combine
 * with `isExpiryValid` for that.
 */
export function parseExpiry(input: string): ParsedExpiry | null {
  const match = EXPIRY_STRING_PATTERN.exec(input.trim());

  if (!match) {
    return null;
  }

  return {
    month: Number(match[1]),
    year: normalizeExpiryYear(Number(match[2])),
  };
}
