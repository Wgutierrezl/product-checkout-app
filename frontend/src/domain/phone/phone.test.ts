import { isValidE164Phone, parsePhone, toE164 } from './phone';

describe('toE164', () => {
  it('combines a dial code and national number into an E.164 string', () => {
    expect(toE164('57', '3001234567')).toBe('+573001234567');
  });

  it('strips non-digit characters from the national number', () => {
    expect(toE164('1', '(415) 555-0100')).toBe('+14155550100');
  });

  it('strips a leading + from the dial code if one was passed in', () => {
    expect(toE164('+57', '3001234567')).toBe('+573001234567');
  });
});

describe('isValidE164Phone', () => {
  it('accepts a well-formed E.164 number', () => {
    expect(isValidE164Phone('+573001234567')).toBe(true);
  });

  it('rejects a value without a leading +', () => {
    expect(isValidE164Phone('573001234567')).toBe(false);
  });

  it('accepts the shortest valid total length (8 digits)', () => {
    expect(isValidE164Phone('+12345678')).toBe(true);
  });

  it('rejects fewer than 8 total digits', () => {
    expect(isValidE164Phone('+1234567')).toBe(false);
  });

  it('accepts the longest valid total length (15 digits)', () => {
    expect(isValidE164Phone('+123456789012345')).toBe(true);
  });

  it('rejects more than 15 total digits', () => {
    expect(isValidE164Phone('+1234567890123456')).toBe(false);
  });

  it('rejects non-digit characters after the +', () => {
    expect(isValidE164Phone('+57 300 123 4567')).toBe(false);
  });
});

describe('parsePhone', () => {
  it('parses an already-E.164 value into its dial code and national number', () => {
    expect(parsePhone('+573001234567')).toEqual({ dialCode: '57', nationalNumber: '3001234567' });
  });

  it('matches the longest known dial code first (avoids a 1-digit false match)', () => {
    expect(parsePhone('+34600123456')).toEqual({ dialCode: '34', nationalNumber: '600123456' });
  });

  it('treats a plain, unprefixed phone as an existing Colombian (+57) national number', () => {
    expect(parsePhone('3001234567')).toEqual({ dialCode: '57', nationalNumber: '3001234567' });
  });

  it('defaults to Colombia with an empty national number for an empty value', () => {
    expect(parsePhone('')).toEqual({ dialCode: '57', nationalNumber: '' });
  });

  it('falls back to Colombia when the + prefix does not match any known dial code', () => {
    expect(parsePhone('+9999999999')).toEqual({ dialCode: '57', nationalNumber: '9999999999' });
  });
});
