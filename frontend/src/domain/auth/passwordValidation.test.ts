import { validatePassword, validatePasswordConfirmation } from './passwordValidation';

describe('validatePassword', () => {
  it('requires a value', () => {
    expect(validatePassword('')).toBe('Password is required');
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(validatePassword('short1')).toBe('Password must be at least 8 characters');
  });

  it('accepts an 8+ character password', () => {
    expect(validatePassword('hunter22')).toBeNull();
  });
});

describe('validatePasswordConfirmation', () => {
  it('requires a value', () => {
    expect(validatePasswordConfirmation('', 'hunter22')).toBe('Please confirm your password');
  });

  it('rejects a mismatched confirmation', () => {
    expect(validatePasswordConfirmation('other123', 'hunter22')).toBe('Passwords do not match');
  });

  it('accepts a matching confirmation', () => {
    expect(validatePasswordConfirmation('hunter22', 'hunter22')).toBeNull();
  });
});
