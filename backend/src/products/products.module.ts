import { Module } from '@nestjs/common';

import { GetProductUseCase } from './application/get-product.use-case';
import { ListProductsUseCase } from './application/list-products.use-case';
import { PRODUCT_REPOSITORY_PORT } from './domain/product.repository.port';
import { DynamoProductRepository } from './infrastructure/dynamo-product.repository';
import { ProductsController } from './infrastructure/products.controller';

@Module({
  controllers: [ProductsController],
  providers: [
    ListProductsUseCase,
    GetProductUseCase,
    { provide: PRODUCT_REPOSITORY_PORT, useClass: DynamoProductRepository },
  ],
  // Exported so TransactionsModule (PR5) can inject PRODUCT_REPOSITORY_PORT for the create-transaction pipeline.
  exports: [PRODUCT_REPOSITORY_PORT],
})
export class ProductsModule {}
