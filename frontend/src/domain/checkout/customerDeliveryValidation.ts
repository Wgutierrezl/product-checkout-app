const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** An optional leading +, then 7-15 digits — no spaces, dashes, or other separators. */
const PHONE_PATTERN = /^\+?\d{7,15}$/;

/**
 * Exported for reuse by other required-text-field validators outside this
 * module (e.g. `PaymentForm`'s cardholder name), so the "trim and check
 * emptiness" rule isn't duplicated with a subtly different implementation.
 */
export function requireNonEmpty(value: string, message: string): string | null {
  return value.trim().length === 0 ? message : null;
}

/** Returns an error message, or `null` when the value is valid. */
export function validateFullName(value: string): string | null {
  return requireNonEmpty(value, 'Full name is required');
}

export function validateEmail(value: string): string | null {
  const required = requireNonEmpty(value, 'Email is required');
  if (required) {
    return required;
  }
  return EMAIL_PATTERN.test(value.trim()) ? null : 'Enter a valid email address';
}

export function validatePhone(value: string): string | null {
  const required = requireNonEmpty(value, 'Phone is required');
  if (required) {
    return required;
  }
  return PHONE_PATTERN.test(value.trim()) ? null : 'Enter a valid phone number';
}

export function validateAddress(value: string): string | null {
  return requireNonEmpty(value, 'Address is required');
}

export function validateCity(value: string): string | null {
  return requireNonEmpty(value, 'City is required');
}

export function validateRegion(value: string): string | null {
  return requireNonEmpty(value, 'Region is required');
}
