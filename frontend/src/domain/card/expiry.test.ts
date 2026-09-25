import { isExpiryValid, parseExpiry } from './expiry';

describe('isExpiryValid', () => {
  const referenceNow = new Date(2026, 8, 15); // September 2026

  it('rejects a month/year combination in the past', () => {
    expect(isExpiryValid(4, 2026, referenceNow)).toBe(false);
  });

  it('accepts the current month/year as still valid', () => {
    expect(isExpiryValid(9, 2026, referenceNow)).toBe(true);
  });

  it('rejects the previous month of the current year', () => {
    expect(isExpiryValid(8, 2026, referenceNow)).toBe(false);
  });

  it('accepts a future month/year', () => {
    expect(isExpiryValid(1, 2027, referenceNow)).toBe(true);
  });

  it('rejects month 0', () => {
    expect(isExpiryValid(0, 2027, referenceNow)).toBe(false);
  });

  it('rejects month 13', () => {
    expect(isExpiryValid(13, 2027, referenceNow)).toBe(false);
  });

  it('rejects any month in a year before the current year', () => {
    expect(isExpiryValid(12, 2020, referenceNow)).toBe(false);
  });

  it('defaults to the real current date when `now` is not provided', () => {
    expect(isExpiryValid(12, 2099)).toBe(true);
  });

  it('normalizes a 2-digit year for the current year as still valid', () => {
    expect(isExpiryValid(9, 26, referenceNow)).toBe(true);
  });

  it('normalizes a 2-digit year for a previous month as invalid', () => {
    expect(isExpiryValid(8, 26, referenceNow)).toBe(false);
  });

  it('normalizes a 2-digit year that is in the future as valid', () => {
    expect(isExpiryValid(6, 27, referenceNow)).toBe(true);
  });
});

describe('parseExpiry', () => {
  it('parses an "MM/YY" string, normalizing the 2-digit year', () => {
    expect(parseExpiry('06/27')).toEqual({ month: 6, year: 2027 });
  });

  it('parses an "MM/YYYY" string as-is', () => {
    expect(parseExpiry('06/2027')).toEqual({ month: 6, year: 2027 });
  });

  it('returns null for a malformed string', () => {
    expect(parseExpiry('not-a-date')).toBeNull();
  });

  it('combines with isExpiryValid: "06/27" in September 2026 is valid', () => {
    const referenceNow = new Date(2026, 8, 15); // September 2026
    const parsed = parseExpiry('06/27');

    expect(parsed).not.toBeNull();
    expect(isExpiryValid(parsed!.month, parsed!.year, referenceNow)).toBe(
      true,
    );
  });
});
