/** Any run of 12-19 consecutive digits is a plausible PAN (the shortest and longest card lengths in wide use). */
const DIGIT_RUN_PATTERN = /\d{12,19}/g;

/**
 * Defensively masks any plausible card-number-shaped digit run in arbitrary
 * text. Used as a last line of defense on any message that could ever
 * originate from outside this codebase (e.g. a third-party gateway
 * response) before it reaches the UI — even though callers should already
 * be mapping such text to an allowlisted message rather than passing it
 * through verbatim.
 */
export function redactCardNumbers(text: string): string {
  return text.replace(DIGIT_RUN_PATTERN, '[redacted]');
}
