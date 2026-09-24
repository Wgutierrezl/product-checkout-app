import { Inject, Injectable } from '@nestjs/common';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { Result, ResultAsync } from 'neverthrow';

import { UnexpectedError, NotFoundError } from '../../shared/errors/domain-error';
import { AppResult, AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { DYNAMO_DOCUMENT_CLIENT } from '../../shared/infrastructure/dynamo/dynamo-client.provider';
import { Product } from '../domain/product.entity';
import { ProductRepositoryPort } from '../domain/product.repository.port';
import { Money } from '../domain/value-objects/money.vo';
import { Stock } from '../domain/value-objects/stock.vo';

export const PRODUCTS_TABLE_NAME = 'Products';

interface ProductItem {
  productId: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
}

function toProduct(item: ProductItem): AppResult<Product> {
  return Result.combine([Money.create(item.priceCents), Stock.create(item.stock)]).map(
    ([price, stock]) => ({
      id: item.productId,
      name: item.name,
      description: item.description,
      price,
      stock,
      imageUrl: item.imageUrl,
    }),
  );
}

@Injectable()
export class DynamoProductRepository implements ProductRepositoryPort {
  constructor(
    @Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient,
  ) {}

  findAll(): AppResultAsync<Product[]> {
    return ResultAsync.fromPromise(
      this.client.send(new ScanCommand({ TableName: PRODUCTS_TABLE_NAME })),
      (error) => new UnexpectedError(`Failed to scan products: ${(error as Error).message}`),
    ).andThen((result) => {
      const items = (result.Items ?? []) as ProductItem[];
      return Result.combine(items.map((item) => toProduct(item))).asyncMap((products) =>
        Promise.resolve(products),
      );
    });
  }

  findById(id: string): AppResultAsync<Product> {
    return ResultAsync.fromPromise(
      this.client.send(new GetCommand({ TableName: PRODUCTS_TABLE_NAME, Key: { productId: id } })),
      (error) => new UnexpectedError(`Failed to get product ${id}: ${(error as Error).message}`),
    ).andThen((result) => {
      if (!result.Item) {
        return errAsync(new NotFoundError(`Product ${id} not found`));
      }

      const product = toProduct(result.Item as ProductItem);
      return product.isOk() ? okAsync(product.value) : errAsync(product.error);
    });
  }
}
