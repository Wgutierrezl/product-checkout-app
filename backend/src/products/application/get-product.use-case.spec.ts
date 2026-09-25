import { buildProduct, FakeProductRepository } from '../test/product.fixtures';
import { GetProductUseCase } from './get-product.use-case';

describe('GetProductUseCase', () => {
  it('returns the product when it exists', async () => {
    const product = buildProduct();
    const useCase = new GetProductUseCase(new FakeProductRepository([product]));

    const result = await useCase.execute('prod-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(product);
  });

  it('returns NotFoundError when the product does not exist', async () => {
    const useCase = new GetProductUseCase(new FakeProductRepository([]));

    const result = await useCase.execute('unknown-id');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('NotFound');
  });
});
