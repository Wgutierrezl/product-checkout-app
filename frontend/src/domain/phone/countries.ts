/**
 * Country list for the phone country-code selector. Deliberately
 * hand-written and self-contained (no `libphonenumber`/`country-data`
 * dependency) — covers the Americas (the checkout's primary market),
 * Spain, and a handful of other common destinations. `dialCode` never
 * includes the leading "+".
 */
export interface Country {
  name: string;
  /** ISO 3166-1 alpha-2 code, used both as the React key and to derive the flag emoji. */
  iso2: string;
  dialCode: string;
}

export const COUNTRIES: readonly Country[] = [
  { name: 'Colombia', iso2: 'CO', dialCode: '57' },
  { name: 'United States', iso2: 'US', dialCode: '1' },
  { name: 'Canada', iso2: 'CA', dialCode: '1' },
  { name: 'Mexico', iso2: 'MX', dialCode: '52' },
  { name: 'Guatemala', iso2: 'GT', dialCode: '502' },
  { name: 'Belize', iso2: 'BZ', dialCode: '501' },
  { name: 'El Salvador', iso2: 'SV', dialCode: '503' },
  { name: 'Honduras', iso2: 'HN', dialCode: '504' },
  { name: 'Nicaragua', iso2: 'NI', dialCode: '505' },
  { name: 'Costa Rica', iso2: 'CR', dialCode: '506' },
  { name: 'Panama', iso2: 'PA', dialCode: '507' },
  { name: 'Cuba', iso2: 'CU', dialCode: '53' },
  { name: 'Dominican Republic', iso2: 'DO', dialCode: '1' },
  { name: 'Haiti', iso2: 'HT', dialCode: '509' },
  { name: 'Jamaica', iso2: 'JM', dialCode: '1' },
  { name: 'Trinidad and Tobago', iso2: 'TT', dialCode: '1' },
  { name: 'Bahamas', iso2: 'BS', dialCode: '1' },
  { name: 'Barbados', iso2: 'BB', dialCode: '1' },
  { name: 'Venezuela', iso2: 'VE', dialCode: '58' },
  { name: 'Ecuador', iso2: 'EC', dialCode: '593' },
  { name: 'Peru', iso2: 'PE', dialCode: '51' },
  { name: 'Brazil', iso2: 'BR', dialCode: '55' },
  { name: 'Bolivia', iso2: 'BO', dialCode: '591' },
  { name: 'Paraguay', iso2: 'PY', dialCode: '595' },
  { name: 'Chile', iso2: 'CL', dialCode: '56' },
  { name: 'Argentina', iso2: 'AR', dialCode: '54' },
  { name: 'Uruguay', iso2: 'UY', dialCode: '598' },
  { name: 'Guyana', iso2: 'GY', dialCode: '592' },
  { name: 'Suriname', iso2: 'SR', dialCode: '597' },
  { name: 'Puerto Rico', iso2: 'PR', dialCode: '1' },
  { name: 'Spain', iso2: 'ES', dialCode: '34' },
  { name: 'United Kingdom', iso2: 'GB', dialCode: '44' },
  { name: 'France', iso2: 'FR', dialCode: '33' },
  { name: 'Germany', iso2: 'DE', dialCode: '49' },
  { name: 'Italy', iso2: 'IT', dialCode: '39' },
  { name: 'Portugal', iso2: 'PT', dialCode: '351' },
  { name: 'Netherlands', iso2: 'NL', dialCode: '31' },
  { name: 'Switzerland', iso2: 'CH', dialCode: '41' },
  { name: 'Sweden', iso2: 'SE', dialCode: '46' },
  { name: 'Norway', iso2: 'NO', dialCode: '47' },
  { name: 'Ireland', iso2: 'IE', dialCode: '353' },
  { name: 'Belgium', iso2: 'BE', dialCode: '32' },
  { name: 'Austria', iso2: 'AT', dialCode: '43' },
  { name: 'Poland', iso2: 'PL', dialCode: '48' },
  { name: 'Russia', iso2: 'RU', dialCode: '7' },
  { name: 'Turkey', iso2: 'TR', dialCode: '90' },
  { name: 'South Africa', iso2: 'ZA', dialCode: '27' },
  { name: 'Israel', iso2: 'IL', dialCode: '972' },
  { name: 'United Arab Emirates', iso2: 'AE', dialCode: '971' },
  { name: 'Saudi Arabia', iso2: 'SA', dialCode: '966' },
  { name: 'China', iso2: 'CN', dialCode: '86' },
  { name: 'India', iso2: 'IN', dialCode: '91' },
  { name: 'Japan', iso2: 'JP', dialCode: '81' },
  { name: 'South Korea', iso2: 'KR', dialCode: '82' },
  { name: 'Australia', iso2: 'AU', dialCode: '61' },
  { name: 'New Zealand', iso2: 'NZ', dialCode: '64' },
];

/** Default country for a brand-new checkout: Colombia (this checkout's primary market). */
export const DEFAULT_COUNTRY_ISO2 = 'CO';

const REGIONAL_INDICATOR_OFFSET = 127397;

/**
 * Derives a country's flag emoji from its ISO 3166-1 alpha-2 code by
 * mapping each letter to its "regional indicator symbol" code point —
 * no per-country emoji needs to be hand-typed/maintained.
 */
export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .split('')
    .map((letter) => String.fromCodePoint(letter.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET))
    .join('');
}

export function findCountryByIso2(iso2: string): Country | undefined {
  return COUNTRIES.find((country) => country.iso2 === iso2);
}

/**
 * Several countries share a dial code (e.g. "1" for the US, Canada, and
 * several Caribbean nations) — this returns the FIRST match in `COUNTRIES`,
 * an arbitrary but stable tie-break used only to pick which flag/name to
 * show for a dial code parsed back out of an E.164 phone (see
 * `domain/phone/phone.ts`'s `parsePhone`).
 */
export function findCountryByDialCode(dialCode: string): Country | undefined {
  return COUNTRIES.find((country) => country.dialCode === dialCode);
}
