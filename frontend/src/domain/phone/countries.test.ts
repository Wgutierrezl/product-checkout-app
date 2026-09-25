import { COUNTRIES, DEFAULT_COUNTRY_ISO2, findCountryByDialCode, findCountryByIso2, flagEmoji } from './countries';

describe('COUNTRIES', () => {
  it('covers a broad list of countries, each with a name, iso2, and dialCode', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(40);
    expect(COUNTRIES.length).toBeLessThanOrEqual(60);
    for (const country of COUNTRIES) {
      expect(country.name.length).toBeGreaterThan(0);
      expect(country.iso2).toMatch(/^[A-Z]{2}$/);
      expect(country.dialCode).toMatch(/^\d{1,3}$/);
    }
  });

  it('has no duplicate iso2 codes', () => {
    const codes = COUNTRIES.map((country) => country.iso2);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('includes Colombia as the default country', () => {
    const colombia = findCountryByIso2(DEFAULT_COUNTRY_ISO2);
    expect(colombia).toEqual({ name: 'Colombia', iso2: 'CO', dialCode: '57' });
  });
});

describe('findCountryByIso2', () => {
  it('finds a country by its ISO2 code', () => {
    expect(findCountryByIso2('US')).toEqual({ name: 'United States', iso2: 'US', dialCode: '1' });
  });

  it('returns undefined for an unknown code', () => {
    expect(findCountryByIso2('ZZ')).toBeUndefined();
  });
});

describe('findCountryByDialCode', () => {
  it('finds a country by its dial code', () => {
    expect(findCountryByDialCode('57')).toEqual({ name: 'Colombia', iso2: 'CO', dialCode: '57' });
  });

  it('returns the first match for a dial code shared by multiple countries', () => {
    expect(findCountryByDialCode('1')).toEqual({ name: 'United States', iso2: 'US', dialCode: '1' });
  });

  it('returns undefined for an unknown dial code', () => {
    expect(findCountryByDialCode('999')).toBeUndefined();
  });
});

describe('flagEmoji', () => {
  it('derives the Colombia flag from its ISO2 code', () => {
    expect(flagEmoji('CO')).toBe('🇨🇴');
  });

  it('derives the United States flag from its ISO2 code', () => {
    expect(flagEmoji('US')).toBe('🇺🇸');
  });

  it('is case-insensitive', () => {
    expect(flagEmoji('co')).toBe(flagEmoji('CO'));
  });
});
