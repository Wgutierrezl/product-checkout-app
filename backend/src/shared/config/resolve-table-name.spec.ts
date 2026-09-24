import { resolveTableName } from './resolve-table-name';

describe('resolveTableName', () => {
  it('returns the env value when it is set (Lambda deploy-time override)', () => {
    expect(resolveTableName('checkout-prod-Products', 'Products')).toBe('checkout-prod-Products');
  });

  it('falls back to the default table name when the env value is unset (local/dev)', () => {
    expect(resolveTableName(undefined, 'Products')).toBe('Products');
  });
});
