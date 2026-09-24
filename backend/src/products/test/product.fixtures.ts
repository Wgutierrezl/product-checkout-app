import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { Product } from '../domain/product.entity';
import { ProductRepositoryPort } from '../domain/product.repository.port';
import { Money } from '../domain/value-objects/money.vo';
import { Stock } from '../domain/value-objects/stock.vo';

/**
 * Shared test fixtures for the products module's use-case and controller
 * specs. Test-only: never imported from production code.
 */

export function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Wireless Headphones',
    description: 'Noise-cancelling over-ear headphones',
    price: Money.create(150_000)._unsafeUnwrap(),
    stock: Stock.create(10)._unsafeUnwrap(),
    imageUrl: 'https://images.example.com/headphones.webp',
    ...overrides,
  };
}

export class FakeProductRepository implements ProductRepositoryPort {
  constructor(private readonly products: Product[] = []) {}

  findAll() {
    return okAsync(this.products);
  }

  findById(id: string) {
    const found = this.products.find((product) => product.id === id);
    return found ? okAsync(found) : errAsync(new NotFoundError(`Product ${id} not found`));
  }
}
