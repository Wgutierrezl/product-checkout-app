import { isValidLuhn } from './luhn';

describe('isValidLuhn', () => {
  it('accepts a card number that passes the Luhn checksum', () => {
    expect(isValidLuhn('4111111111111111')).toBe(true);
  });

  it('accepts a Luhn-valid number with spaces as separators', () => {
    expect(isValidLuhn('4111 1111 1111 1111')).toBe(true);
  });

  it('rejects a card number that fails the Luhn checksum', () => {
    expect(isValidLuhn('4111111111111112')).toBe(false);
  });

  it('accepts a Luhn-valid number that requires digit-doubling carry (>9)', () => {
    expect(isValidLuhn('49927398716')).toBe(true);
  });

  it('rejects input containing non-digit characters', () => {
    expect(isValidLuhn('4111-1111-1111-111a')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidLuhn('')).toBe(false);
  });
});
