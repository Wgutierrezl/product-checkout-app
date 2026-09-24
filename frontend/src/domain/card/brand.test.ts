import { detectCardBrand } from './brand';

describe('detectCardBrand', () => {
  it('detects Visa for numbers starting with 4', () => {
    expect(detectCardBrand('4111111111111111')).toBe('visa');
  });

  it('detects Mastercard for numbers in the 51-55 BIN range', () => {
    expect(detectCardBrand('5500000000000004')).toBe('mastercard');
  });

  it('detects Mastercard for numbers in the 2221-2720 BIN range', () => {
    expect(detectCardBrand('2223000048400011')).toBe('mastercard');
  });

  it('returns unknown for unsupported brands (e.g. Discover)', () => {
    expect(detectCardBrand('6011000000000004')).toBe('unknown');
  });

  it('returns unknown for a blank or too-short number', () => {
    expect(detectCardBrand('41')).toBe('unknown');
  });
});
