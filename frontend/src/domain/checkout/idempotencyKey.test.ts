import { generateIdempotencyKey } from './idempotencyKey';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateIdempotencyKey', () => {
  it('returns a valid UUIDv4', () => {
    expect(generateIdempotencyKey()).toMatch(UUID_V4_REGEX);
  });

  it('returns a different value on each call', () => {
    expect(generateIdempotencyKey()).not.toBe(generateIdempotencyKey());
  });
});
