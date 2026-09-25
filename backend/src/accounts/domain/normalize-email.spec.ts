import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it('lowercases the email', () => {
    expect(normalizeEmail('Foo@Bar.com')).toBe('foo@bar.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  foo@bar.com  ')).toBe('foo@bar.com');
  });

  it('trims and lowercases together', () => {
    expect(normalizeEmail('  Foo@Bar.com  ')).toBe('foo@bar.com');
  });

  it('is idempotent — normalizing an already-normalized email is a no-op', () => {
    expect(normalizeEmail('foo@bar.com')).toBe('foo@bar.com');
  });
});
