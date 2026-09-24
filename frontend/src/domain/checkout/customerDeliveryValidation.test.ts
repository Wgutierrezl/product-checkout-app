import {
  validateAddress,
  validateCity,
  validateEmail,
  validateFullName,
  validatePhone,
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

describe('validatePhone', () => {
  it('rejects an empty value', () => {
    expect(validatePhone('')).toBe('Phone is required');
  });

  it('accepts digits with a leading +', () => {
    expect(validatePhone('+573001234567')).toBeNull();
  });

  it('accepts digits without a leading +', () => {
    expect(validatePhone('573001234567')).toBeNull();
  });

  it('accepts the shortest valid length (7 digits)', () => {
    expect(validatePhone('1234567')).toBeNull();
  });

  it('accepts the longest valid length (15 digits)', () => {
    expect(validatePhone('123456789012345')).toBeNull();
  });

  it('rejects fewer than 7 digits', () => {
    expect(validatePhone('123456')).toBe('Enter a valid phone number');
  });

  it('rejects more than 15 digits', () => {
    expect(validatePhone('1234567890123456')).toBe('Enter a valid phone number');
  });

  it('rejects non-digit characters', () => {
    expect(validatePhone('+57 300 123 4567')).toBe('Enter a valid phone number');
    expect(validatePhone('call-me-maybe')).toBe('Enter a valid phone number');
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
