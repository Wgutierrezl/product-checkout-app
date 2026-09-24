import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { Product } from '../domain/product.entity';
import { ProductRepositoryPort } from '../domain/product.repository.port';
import { Money } from '../domain/value-objects/money.vo';
import { Quantity } from '../domain/value-objects/quantity.vo';
import { ListProductsUseCase } from './list-products.use-case';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Wireless Headphones',
    description: 'Noise-cancelling over-ear headphones',
    price: Money.create(150_000)._unsafeUnwrap(),
    stock: Quantity.create(10)._unsafeUnwrap(),
    imageUrl: 'https://images.example.com/headphones.webp',
    ...overrides,
  };
}

class FakeProductRepository implements ProductRepositoryPort {
  constructor(private readonly products: Product[] = []) {}

  findAll() {
    return okAsync(this.products);
  }

  findById(id: string) {
    const found = this.products.find((product) => product.id === id);
    return found ? okAsync(found) : errAsync(new NotFoundError(`Product ${id} not found`));
  }
}

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
