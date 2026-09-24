import { buildProduct, FakeProductRepository } from '../test/product.fixtures';
import { ListProductsUseCase } from './list-products.use-case';

describe('ListProductsUseCase', () => {
  it('returns all products from the repository', async () => {
    const products = [buildProduct(), buildProduct({ id: 'prod-2', name: 'Mechanical Keyboard' })];
    const useCase = new ListProductsUseCase(new FakeProductRepository(products));

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(2);
  });

  it('returns an empty array when there are no products', async () => {
    const useCase = new ListProductsUseCase(new FakeProductRepository([]));

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });
});
