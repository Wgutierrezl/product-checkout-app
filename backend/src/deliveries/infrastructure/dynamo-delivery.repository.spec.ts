import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import {
  DELIVERIES_TABLE_NAME,
  DELIVERIES_TRANSACTION_ID_INDEX_NAME,
  DynamoDeliveryRepository,
} from './dynamo-delivery.repository';

describe('DynamoDeliveryRepository', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMock.reset();
  });

  const item = {
    deliveryId: 'delivery-1',
    transactionId: 'txn-1',
    customerId: 'cust-1',
    address: 'Cra 7 # 71-21',
    city: 'Bogotá',
    region: 'Cundinamarca',
    postalCode: '110231',
    status: 'CREATED',
    createdAt: '2026-09-23T00:00:00.000Z',
  };

  describe('findById', () => {
    it('returns the delivery when the item exists', async () => {
      ddbMock.on(GetCommand).resolves({ Item: item });
      const repository = new DynamoDeliveryRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findById('delivery-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        id: 'delivery-1',
        transactionId: 'txn-1',
        customerId: 'cust-1',
        address: 'Cra 7 # 71-21',
        city: 'Bogotá',
        region: 'Cundinamarca',
        postalCode: '110231',
        status: 'CREATED',
        createdAt: '2026-09-23T00:00:00.000Z',
      });
      expect(ddbMock.commandCalls(GetCommand)[0].args[0].input).toEqual({
        TableName: DELIVERIES_TABLE_NAME,
        Key: { deliveryId: 'delivery-1' },
      });
    });

    it('maps a delivery with no postalCode (optional field omitted)', async () => {
      const { postalCode: _postalCode, ...itemWithoutPostalCode } = item;
      ddbMock.on(GetCommand).resolves({ Item: itemWithoutPostalCode });
      const repository = new DynamoDeliveryRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findById('delivery-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().postalCode).toBeUndefined();
    });

    it('returns NotFoundError when the item does not exist', async () => {
      ddbMock.on(GetCommand).resolves({});
      const repository = new DynamoDeliveryRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findById('missing-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('NotFound');
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(GetCommand).rejects(new Error('network error'));
      const repository = new DynamoDeliveryRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findById('delivery-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });
  });

  describe('findByTransactionId', () => {
    it('returns the delivery when a match is found via the TransactionIdIndex GSI', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [item] });
      const repository = new DynamoDeliveryRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findByTransactionId('txn-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()?.id).toBe('delivery-1');
      const call = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
      expect(call.TableName).toBe(DELIVERIES_TABLE_NAME);
      expect(call.IndexName).toBe(DELIVERIES_TRANSACTION_ID_INDEX_NAME);
      expect(call.ExpressionAttributeValues).toEqual({ ':transactionId': 'txn-1' });
    });

    it('returns null when no delivery matches the transaction id', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const repository = new DynamoDeliveryRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findByTransactionId('txn-unknown');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('network error'));
      const repository = new DynamoDeliveryRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findByTransactionId('txn-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });
  });
});
