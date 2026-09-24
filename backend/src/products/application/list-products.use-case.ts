import { Inject, Injectable } from '@nestjs/common';

import { AppResultAsync } from '../../shared/result/result.types';
import { Product } from '../domain/product.entity';
import { PRODUCT_REPOSITORY_PORT, ProductRepositoryPort } from '../domain/product.repository.port';

@Injectable()
export class ListProductsUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY_PORT) private readonly products: ProductRepositoryPort,
  ) {}

  execute(): AppResultAsync<Product[]> {
    return this.products.findAll();
  }
}
