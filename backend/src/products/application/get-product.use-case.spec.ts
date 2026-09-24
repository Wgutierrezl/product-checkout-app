import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { Product } from '../domain/product.entity';
import { ProductRepositoryPort } from '../domain/product.repository.port';
import { Money } from '../domain/value-objects/money.vo';
import { Quantity } from '../domain/value-objects/quantity.vo';
import { GetProductUseCase } from './get-product.use-case';

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
