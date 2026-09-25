import {
  validateAddress,
  validateCity,
  validateEmail,
  validateFullName,
  validateRegion,
} from './customerDeliveryValidation';

describe('validateFullName', () => {
  it('rejects an empty value', () => {
    expect(validateFullName('')).toBe('Full name is required');
  });

  it('rejects a whitespace-only value', () => {
    expect(validateFullName('   ')).toBe('Full name is required');
  });

  it('accepts a non-empty name', () => {
    expect(validateFullName('Jane Doe')).toBeNull();
  });
});

describe('validateEmail', () => {
  it('rejects an empty value', () => {
    expect(validateEmail('')).toBe('Email is required');
  });

  it('rejects a malformed email', () => {
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address');
  });

  it('accepts a well-formed email', () => {
    expect(validateEmail('jane@example.com')).toBeNull();
  });
});

describe('validateAddress', () => {
  it('rejects an empty value', () => {
    expect(validateAddress('')).toBe('Address is required');
  });

  it('accepts a non-empty address', () => {
    expect(validateAddress('Cra 1 # 2-3')).toBeNull();
  });
});

describe('validateCity', () => {
  it('rejects an empty value', () => {
    expect(validateCity('')).toBe('City is required');
  });

  it('accepts a non-empty city', () => {
    expect(validateCity('Bogota')).toBeNull();
  });
});

describe('validateRegion', () => {
  it('rejects an empty value', () => {
    expect(validateRegion('')).toBe('Region is required');
  });

  it('accepts a non-empty region', () => {
    expect(validateRegion('Cundinamarca')).toBeNull();
  });
});
