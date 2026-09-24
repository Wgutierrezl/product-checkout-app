import { Inject, Injectable, Logger } from '@nestjs/common';
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

type ScanKey = Record<string, unknown>;

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
  private readonly logger = new Logger(DynamoProductRepository.name);

  constructor(
    @Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient,
  ) {}

  findAll(): AppResultAsync<Product[]> {
    return ResultAsync.fromPromise(
      this.scanAllItems(),
      (error) => new UnexpectedError(`Failed to scan products: ${(error as Error).message}`),
    ).map((items) => this.mapValidProducts(items));
  }

  /**
   * A single malformed item (e.g. corrupted price/stock data) must not take
   * down the whole catalog listing. Skip it and log a warning with only its
   * id — never the raw item contents, which could contain corrupt/unexpected
   * data — and keep returning every other valid product.
   */
  private mapValidProducts(items: ProductItem[]): Product[] {
    const products: Product[] = [];

    for (const item of items) {
      const mapped = toProduct(item);

      if (mapped.isOk()) {
        products.push(mapped.value);
      } else {
        this.logger.warn(`Skipping malformed product item: ${item.productId}`);
      }
    }

    return products;
  }

  private async scanAllItems(): Promise<ProductItem[]> {
    const items: ProductItem[] = [];
    let exclusiveStartKey: ScanKey | undefined;

    do {
      const result = await this.client.send(
        new ScanCommand({
          TableName: PRODUCTS_TABLE_NAME,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      items.push(...((result.Items ?? []) as ProductItem[]));
      exclusiveStartKey = result.LastEvaluatedKey as ScanKey | undefined;
    } while (exclusiveStartKey);

    return items;
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
