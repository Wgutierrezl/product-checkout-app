import { isExpiryValid } from './expiry';

describe('isExpiryValid', () => {
  const referenceNow = new Date(2026, 5, 15); // June 2026

  it('rejects a month/year combination in the past', () => {
    expect(isExpiryValid(4, 2026, referenceNow)).toBe(false);
  });

  it('accepts the current month/year as still valid', () => {
    expect(isExpiryValid(6, 2026, referenceNow)).toBe(true);
  });

  it('accepts a future month/year', () => {
    expect(isExpiryValid(1, 2027, referenceNow)).toBe(true);
  });

  it('rejects an out-of-range month', () => {
    expect(isExpiryValid(13, 2027, referenceNow)).toBe(false);
  });

  it('rejects any month in a year before the current year', () => {
    expect(isExpiryValid(12, 2020, referenceNow)).toBe(false);
  });

  it('defaults to the real current date when `now` is not provided', () => {
    expect(isExpiryValid(12, 2099)).toBe(true);
  });
});
