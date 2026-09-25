import { UuidIdGeneratorAdapter } from './uuid-id-generator.adapter';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('UuidIdGeneratorAdapter', () => {
  const generator = new UuidIdGeneratorAdapter();

  it('generates a v4 UUID for newId()', () => {
    expect(generator.newId()).toMatch(UUID_V4_REGEX);
  });

  it('generates a different id on each call', () => {
    expect(generator.newId()).not.toBe(generator.newId());
  });

  it('generates a reference prefixed with REF- followed by a UUID', () => {
    const reference = generator.newReference();

    expect(reference.startsWith('REF-')).toBe(true);
    expect(reference.slice(4)).toMatch(UUID_V4_REGEX);
  });
});
