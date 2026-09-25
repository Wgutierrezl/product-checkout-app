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

export const DEFAULT_DIAL_CODE = findCountryByIso2(DEFAULT_COUNTRY_ISO2)!.dialCode;

/** A Colombian national (mobile) number is always exactly this many digits. */
const CO_NATIONAL_NUMBER_LENGTH = 10;

/**
 * Splits a persisted or freshly-entered phone value into a country dial
 * code + national number, for pre-filling the country selector and
 * national-number field. Handles 4 shapes:
 *
 * - Already E.164 ("+573001234567"): matched against the known dial codes.
 * - A "+" prefix that matches no known dial code (corrupted/foreign data):
 *   falls back to the default country, keeping every digit as the national
 *   number so nothing is silently dropped.
 * - No "+" prefix, but too long to be a bare CO national number
 *   ("573001234567", 12 digits): some legacy data may have had the dial
 *   code typed in without a leading "+" — treated as CO with that leading
 *   "57" recognized as the dial code, rather than doubling it up when
 *   `toE164` re-adds it.
 * - No "+" prefix at all, exactly a CO national number's length ("3001234567"):
 *   older persisted customers, saved before this country selector existed —
 *   treated as a national number under the default country (Colombia),
 *   this checkout's original, only market.
 */
export function parsePhone(value: string): ParsedPhone {
  const trimmed = value.trim();

  if (!trimmed.startsWith('+')) {
    const digits = digitsOnly(trimmed);
    if (digits.length > CO_NATIONAL_NUMBER_LENGTH && digits.startsWith(DEFAULT_DIAL_CODE)) {
      return { dialCode: DEFAULT_DIAL_CODE, nationalNumber: digits.slice(DEFAULT_DIAL_CODE.length) };
    }
    return { dialCode: DEFAULT_DIAL_CODE, nationalNumber: digits };
  }

  const digits = digitsOnly(trimmed);
  const matchedDialCode = DIAL_CODES_LONGEST_FIRST.find((dialCode) => digits.startsWith(dialCode));

  if (!matchedDialCode) {
    return { dialCode: DEFAULT_DIAL_CODE, nationalNumber: digits };
  }

  return { dialCode: matchedDialCode, nationalNumber: digits.slice(matchedDialCode.length) };
}
