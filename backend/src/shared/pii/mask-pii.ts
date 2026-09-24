/**
 * Partial-masking helpers for PII returned by unauthenticated read endpoints
 * (e.g. `GET /customers/:id`, `GET /deliveries/:id`). The app has no auth
 * layer today, so a resource id is effectively guessable/enumerable; masking
 * limits how much PII a caller can harvest from that id while still letting
 * the legitimate owner (who already knows their own data) recognize the
 * record.
 *
 * All slicing here uses `Array.from` (Unicode code-point iteration) instead
 * of plain string indexing/`.slice()`, so an astral character (e.g. an emoji,
 * which is a surrogate pair in UTF-16) is never split in half.
 */

export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return '***';
  }

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const localChars = Array.from(localPart);

  if (localChars.length <= 2) {
    return `${localChars.slice(0, 1).join('')}***@${domain}`;
  }

  const visible = localChars.slice(0, 2).join('');
  const masked = '*'.repeat(localChars.length - 2);
  return `${visible}${masked}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = Array.from(phone).filter((char) => /\d/.test(char));

  if (digits.length <= 4) {
    return '*'.repeat(digits.length);
  }

  const lastFour = digits.slice(-4).join('');
  const masked = '*'.repeat(digits.length - 4);
  return `${masked}${lastFour}`;
}

/**
 * Keeps the first 4 characters of an address line visible, replacing
 * everything else with a fixed `***` suffix (not proportional to length —
 * unlike `maskEmail`/`maskPhone`, the goal here is just to give a caller a
 * recognizable prefix, e.g. "Cra ***", not to size-hint the full address).
 */
export function maskAddress(address: string): string {
  const chars = Array.from(address);
  const visible = chars.slice(0, 4).join('');
  return `${visible}***`;
}
