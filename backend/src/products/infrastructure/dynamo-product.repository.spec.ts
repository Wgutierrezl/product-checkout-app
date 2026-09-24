import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { DynamoProductRepository, PRODUCTS_TABLE_NAME } from './dynamo-product.repository';

describe('DynamoProductRepository', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMock.reset();
  });

  describe('findAll', () => {
    it('maps scanned items into domain Products', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [
          {
            productId: 'prod-1',
            name: 'Wireless Headphones',
            description: 'Noise-cancelling over-ear headphones',
            priceCents: 150_000,
            stock: 10,
            imageUrl: 'https://images.example.com/headphones.webp',
          },
        ],
      });
      const repository = new DynamoProductRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findAll();

      expect(result.isOk()).toBe(true);
      const products = result._unsafeUnwrap();
      expect(products).toHaveLength(1);
      expect(products[0].id).toBe('prod-1');
      expect(products[0].price.valueInCents).toBe(150_000);
      expect(products[0].stock.value).toBe(10);
      expect(ddbMock.commandCalls(ScanCommand)[0].args[0].input.TableName).toBe(
        PRODUCTS_TABLE_NAME,
      );
    });

    it('returns an empty array when the table has no items', async () => {
      ddbMock.on(ScanCommand).resolves({});
      const repository = new DynamoProductRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findAll();

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(ScanCommand).rejects(new Error('network error'));
      const repository = new DynamoProductRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findAll();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('maps and returns an out-of-stock product (stock 0)', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [
          {
            productId: 'prod-oos',
            name: 'Sold Out Gadget',
            description: 'Temporarily unavailable',
            priceCents: 50_000,
            stock: 0,
            imageUrl: 'https://images.example.com/sold-out.webp',
          },
        ],
      });
      const repository = new DynamoProductRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findAll();

      expect(result.isOk()).toBe(true);
      const products = result._unsafeUnwrap();
      expect(products).toHaveLength(1);
      expect(products[0].stock.value).toBe(0);
    });
  });

  describe('findById', () => {
    it('returns the product when the item exists', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          productId: 'prod-1',
          name: 'Wireless Headphones',
          description: 'Noise-cancelling over-ear headphones',
          priceCents: 150_000,
          stock: 10,
          imageUrl: 'https://images.example.com/headphones.webp',
        },
      });
      const repository = new DynamoProductRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('prod-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().id).toBe('prod-1');
      expect(ddbMock.commandCalls(GetCommand)[0].args[0].input).toEqual({
        TableName: PRODUCTS_TABLE_NAME,
        Key: { productId: 'prod-1' },
      });
    });

    it('returns NotFoundError when the item does not exist', async () => {
      ddbMock.on(GetCommand).resolves({});
      const repository = new DynamoProductRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('missing-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('NotFound');
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(GetCommand).rejects(new Error('network error'));
      const repository = new DynamoProductRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('prod-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns a Validation error when the stored item has corrupt data', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          productId: 'prod-1',
          name: 'Corrupt Product',
          description: 'Has a negative price',
          priceCents: -1,
          stock: 10,
          imageUrl: 'https://images.example.com/broken.webp',
        },
      });
      const repository = new DynamoProductRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('prod-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    });
  });
});
