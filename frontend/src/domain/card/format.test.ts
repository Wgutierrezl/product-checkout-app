import { digitsOnly, formatCardNumberInput } from './format';

describe('digitsOnly', () => {
  it('strips every non-digit character', () => {
    expect(digitsOnly('4111-1111 1111.1111')).toBe('4111111111111111');
  });

  it('returns an empty string when there are no digits', () => {
    expect(digitsOnly('abc')).toBe('');
  });
});

describe('formatCardNumberInput', () => {
  it('groups digits into blocks of 4 separated by spaces', () => {
    expect(formatCardNumberInput('4111111111111111')).toBe('4111 1111 1111 1111');
  });

  it('formats a partial number as the buyer is still typing', () => {
    expect(formatCardNumberInput('41111')).toBe('4111 1');
  });

  it('strips non-digit characters (e.g. pasted dashes or existing spaces)', () => {
    expect(formatCardNumberInput('4111-1111-1111-1111')).toBe('4111 1111 1111 1111');
    expect(formatCardNumberInput('4111 1111 1111 1111')).toBe('4111 1111 1111 1111');
  });

  it('caps the input at 19 digits', () => {
    expect(formatCardNumberInput('1'.repeat(30))).toBe(
      '1111 1111 1111 1111 111',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(formatCardNumberInput('')).toBe('');
  });
});
