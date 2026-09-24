import { isValidCvc } from './cvc';

describe('isValidCvc', () => {
  it('accepts a 3-digit CVC', () => {
    expect(isValidCvc('123')).toBe(true);
  });

  it('rejects a 2-digit CVC', () => {
    expect(isValidCvc('12')).toBe(false);
  });

  it('rejects a 4-digit CVC', () => {
    expect(isValidCvc('1234')).toBe(false);
  });

  it('rejects a CVC containing non-digit characters', () => {
    expect(isValidCvc('12a')).toBe(false);
  });
});
