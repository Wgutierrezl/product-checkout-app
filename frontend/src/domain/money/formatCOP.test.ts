import { formatCOP } from './formatCOP';

const expected = (cents: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(cents / 100);

describe('formatCOP', () => {
  it('formats an amount in cents as COP currency', () => {
    expect(formatCOP(150000)).toBe(expected(150000));
  });

  it('formats zero as COP currency', () => {
    expect(formatCOP(0)).toBe(expected(0));
  });

  it('formats a large amount as COP currency', () => {
    expect(formatCOP(123456789)).toBe(expected(123456789));
  });
});
