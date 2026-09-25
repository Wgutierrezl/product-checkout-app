import { Inject, Injectable } from '@nestjs/common';

import { AppResultAsync } from '../../shared/result/result.types';
import { Product } from '../domain/product.entity';
import { PRODUCT_REPOSITORY_PORT, ProductRepositoryPort } from '../domain/product.repository.port';

@Injectable()
export class GetProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY_PORT) private readonly products: ProductRepositoryPort,
  ) {}

  execute(id: string): AppResultAsync<Product> {
    return this.products.findById(id);
  }
}
