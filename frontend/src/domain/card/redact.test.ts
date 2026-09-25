import { redactCardNumbers } from './redact';

describe('redactCardNumbers', () => {
  it('redacts a 16-digit sequence embedded in arbitrary text', () => {
    expect(redactCardNumbers('Card 4111111111111111 was declined')).toBe('Card [redacted] was declined');
  });

  it('redacts a 12-digit sequence (the shortest plausible PAN)', () => {
    expect(redactCardNumbers('411111111111')).toBe('[redacted]');
  });

  it('redacts only the first 19 digits of a longer run, leaving the remainder', () => {
    expect(redactCardNumbers('41111111111111111112')).toBe('[redacted]2');
  });

  it('redacts every matching run, not just the first', () => {
    expect(redactCardNumbers('4111111111111111 and 5105105105105100')).toBe('[redacted] and [redacted]');
  });

  it('leaves short digit runs (below 12 digits) untouched', () => {
    expect(redactCardNumbers('order #123456')).toBe('order #123456');
  });

  it('leaves text with no digits untouched', () => {
    expect(redactCardNumbers('The card was declined')).toBe('The card was declined');
  });
});
