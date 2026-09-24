/**
 * Partial-masking helpers for PII returned by unauthenticated read endpoints
 * (e.g. `GET /customers/:id`). The app has no auth layer today, so a
 * customer id is effectively guessable/enumerable; masking limits how much
 * contact PII a caller can harvest from that id while still letting the
 * legitimate owner (who already knows their own data) recognize the record.
 */

export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return '***';
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length <= 2) {
    return `${local.slice(0, 1)}***@${domain}`;
  }

  const visible = local.slice(0, 2);
  const masked = '*'.repeat(local.length - 2);
  return `${visible}${masked}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');

  if (digitsOnly.length <= 4) {
    return '*'.repeat(digitsOnly.length);
  }

  const lastFour = digitsOnly.slice(-4);
  const masked = '*'.repeat(digitsOnly.length - 4);
  return `${masked}${lastFour}`;
}
