import { digitsOnly, formatCardNumberInput, formatExpiryInput } from './format';

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

describe('formatExpiryInput', () => {
  it('inserts a slash after the 2nd digit once a 3rd digit is typed', () => {
    expect(formatExpiryInput('1229')).toBe('12/29');
  });

  it('does not insert a slash while only 1 or 2 digits have been entered', () => {
    expect(formatExpiryInput('1')).toBe('1');
    expect(formatExpiryInput('12')).toBe('12');
  });

  it('auto-pads a leading month digit greater than 1, adding the slash immediately', () => {
    expect(formatExpiryInput('4')).toBe('04/');
  });

  it('does not auto-pad a leading digit of 0 or 1 (could still become a 2-digit month)', () => {
    expect(formatExpiryInput('0')).toBe('0');
    expect(formatExpiryInput('1')).toBe('1');
  });

  it('normalizes an already-slashed "MM/YY" paste', () => {
    expect(formatExpiryInput('12/29')).toBe('12/29');
  });

  it('normalizes a pasted 4-digit year to its last 2 digits', () => {
    expect(formatExpiryInput('12/2029')).toBe('12/29');
  });

  it('normalizes a paste with stray spaces around the slash', () => {
    expect(formatExpiryInput('12 / 2029')).toBe('12/29');
  });

  it('strips non-digit characters other than the digits themselves', () => {
    expect(formatExpiryInput('12-29')).toBe('12/29');
  });

  it('lets backspacing the year digit down to 2 month digits drop the slash naturally', () => {
    // Simulates a buyer backspacing "12/3" down to "12" one character at a
    // time: the 3rd digit and its auto-inserted slash disappear together.
    expect(formatExpiryInput('12/')).toBe('12');
  });

  it('returns an empty string for empty input', () => {
    expect(formatExpiryInput('')).toBe('');
  });
});
