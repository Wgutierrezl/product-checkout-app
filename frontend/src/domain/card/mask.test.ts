import { getLast4, maskCardNumber } from './mask';

describe('getLast4', () => {
  it('returns the last 4 digits of a card number', () => {
    expect(getLast4('4111 1111 1111 1234')).toBe('1234');
  });
});

describe('maskCardNumber', () => {
  it('masks every digit except the last 4, grouped in blocks of 4', () => {
    expect(maskCardNumber('4111111111111234')).toBe('•••• •••• •••• 1234');
  });

  it('masks a 16-digit number entered with spaces the same way', () => {
    expect(maskCardNumber('5500 0000 0000 0004')).toBe('•••• •••• •••• 0004');
  });

  it('returns an empty string for an empty card number', () => {
    expect(maskCardNumber('')).toBe('');
  });
});
