import { digitsOnly } from '../card/format';
import { COUNTRIES, DEFAULT_COUNTRY_ISO2, findCountryByIso2 } from './countries';

/** Total E.164 digits (dial code + national number), excluding the leading "+". */
const E164_MIN_TOTAL_DIGITS = 8;
const E164_MAX_TOTAL_DIGITS = 15;

const E164_PATTERN = new RegExp(`^\\+\\d{${E164_MIN_TOTAL_DIGITS},${E164_MAX_TOTAL_DIGITS}}$`);

/**
 * Combines a country dial code and a national number into a single E.164
 * string ("+<dialCode><nationalDigits>"), the shape the backend's
 * `customer.phone` field expects. Strips any non-digit characters from the
 * national number (and a redundant leading "+" from the dial code) so
 * callers can pass raw, still-being-typed input directly.
 */
export function toE164(dialCode: string, nationalNumber: string): string {
  return `+${digitsOnly(dialCode)}${digitsOnly(nationalNumber)}`;
}

/**
 * Stricter than the backend's own `/^\+?\d{7,15}$/` (which also accepts a
 * bare, un-prefixed number): the checkout always SENDS a "+"-prefixed
 * value it built itself via `toE164`, so requiring the "+" here catches a
 * malformed value before it ever reaches the backend, while staying safely
 * within the backend's accepted 7-15 digit range.
 */
export function isValidE164Phone(value: string): boolean {
  return E164_PATTERN.test(value.trim());
}

export interface ParsedPhone {
  dialCode: string;
  nationalNumber: string;
}

/** Dial codes checked longest-first, so "+34..." matches Spain (34) rather than a shorter, unrelated prefix. */
const DIAL_CODES_LONGEST_FIRST = [...new Set(COUNTRIES.map((country) => country.dialCode))].sort(
  (a, b) => b.length - a.length,
);

const DEFAULT_DIAL_CODE = findCountryByIso2(DEFAULT_COUNTRY_ISO2)!.dialCode;

/**
 * Splits a persisted or freshly-entered phone value into a country dial
 * code + national number, for pre-filling the country selector and
 * national-number field. Handles 3 shapes:
 *
 * - Already E.164 ("+573001234567"): matched against the known dial codes.
 * - A "+" prefix that matches no known dial code (corrupted/foreign data):
 *   falls back to the default country, keeping every digit as the national
 *   number so nothing is silently dropped.
 * - No "+" prefix at all (older persisted customers, saved before this
 *   country selector existed): treated as a national number under the
 *   default country (Colombia) — this checkout's original, only market.
 */
export function parsePhone(value: string): ParsedPhone {
  const trimmed = value.trim();

  if (!trimmed.startsWith('+')) {
    return { dialCode: DEFAULT_DIAL_CODE, nationalNumber: digitsOnly(trimmed) };
  }

  const digits = digitsOnly(trimmed);
  const matchedDialCode = DIAL_CODES_LONGEST_FIRST.find((dialCode) => digits.startsWith(dialCode));

  if (!matchedDialCode) {
    return { dialCode: DEFAULT_DIAL_CODE, nationalNumber: digits };
  }

  return { dialCode: matchedDialCode, nationalNumber: digits.slice(matchedDialCode.length) };
}
