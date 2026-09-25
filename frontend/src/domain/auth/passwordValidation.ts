const MIN_PASSWORD_LENGTH = 8;

/** Returns an error message, or `null` when the value is valid. */
export function validatePassword(value: string): string | null {
  if (value.length === 0) {
    return 'Password is required';
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export function validatePasswordConfirmation(confirmation: string, password: string): string | null {
  if (confirmation.length === 0) {
    return 'Please confirm your password';
  }
  return confirmation === password ? null : 'Passwords do not match';
}
