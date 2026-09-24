import { PRODUCT_REPOSITORY_PORT } from './product.repository.port';

describe('PRODUCT_REPOSITORY_PORT', () => {
  it('is a unique DI token symbol', () => {
    expect(typeof PRODUCT_REPOSITORY_PORT).toBe('symbol');
    expect(PRODUCT_REPOSITORY_PORT.description).toBe('PRODUCT_REPOSITORY_PORT');
  });
});
