import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { DynamoTransactionRepository, TRANSACTIONS_TABLE_NAME } from './dynamo-transaction.repository';

describe('DynamoTransactionRepository', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMock.reset();
  });

  const createPendingInput = {
    id: 'tx-1',
    reference: 'REF-tx-1',
    customerId: 'cust-1',
    productId: 'prod-1',
    quantity: Quantity.create(2)._unsafeUnwrap(),
    unitPrice: Money.create(150_000)._unsafeUnwrap(),
    baseFee: Money.create(250_000)._unsafeUnwrap(),
    deliveryFee: Money.create(800_000)._unsafeUnwrap(),
    totalAmount: Money.create(1_350_000)._unsafeUnwrap(),
    delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
    createdAt: '2026-09-23T00:00:00.000Z',
  };

  const storedItem = {
    transactionId: 'tx-1',
    reference: 'REF-tx-1',
    customerId: 'cust-1',
    productId: 'prod-1',
    quantity: 2,
    unitPriceCents: 150_000,
    baseFeeCents: 250_000,
    deliveryFeeCents: 800_000,
    totalAmountCents: 1_350_000,
    status: 'PENDING',
    deliveryAddress: 'Cra 1 # 2-3',
    deliveryCity: 'Bogota',
    deliveryRegion: 'Cundinamarca',
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
  };

  describe('createPending', () => {
    it('persists a PENDING transaction and reports it as newly created', async () => {
      ddbMock.on(PutCommand).resolves({});
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.createPending(createPendingInput);

      expect(result.isOk()).toBe(true);
      const { transaction, wasCreated } = result._unsafeUnwrap();
      expect(wasCreated).toBe(true);
      expect(transaction).toMatchObject({ id: 'tx-1', status: 'PENDING' });
      const call = ddbMock.commandCalls(PutCommand)[0].args[0].input;
      expect(call.TableName).toBe(TRANSACTIONS_TABLE_NAME);
      expect(call.Item).toEqual(storedItem);
      expect(call.ConditionExpression).toBe('attribute_not_exists(transactionId)');
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(PutCommand).rejects(new Error('network error'));
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.createPending(createPendingInput);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns the existing transaction with wasCreated=false on an idempotent replay (ConditionalCheckFailed)', async () => {
      ddbMock.on(PutCommand).rejects(
        new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} }),
      );
      ddbMock.on(GetCommand).resolves({ Item: storedItem });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.createPending(createPendingInput);

      expect(result.isOk()).toBe(true);
      const { transaction, wasCreated } = result._unsafeUnwrap();
      expect(wasCreated).toBe(false);
      expect(transaction).toMatchObject({ id: 'tx-1', reference: 'REF-tx-1', status: 'PENDING' });
    });

    it('returns ValidationError when the replayed existing item has corrupt data', async () => {
      ddbMock.on(PutCommand).rejects(
        new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} }),
      );
      ddbMock.on(GetCommand).resolves({ Item: { ...storedItem, unitPriceCents: -1 } });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.createPending(createPendingInput);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    });

    it('returns UnexpectedError when ConditionalCheckFailed but the existing item cannot be found', async () => {
      ddbMock.on(PutCommand).rejects(
        new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} }),
      );
      ddbMock.on(GetCommand).resolves({});
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.createPending(createPendingInput);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });
  });

  describe('updateGatewayResult', () => {
    it('updates status, gatewayTransactionId, and lastGatewayCheckAt', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { ...storedItem, status: 'APPROVED', gatewayTransactionId: 'gw-1', updatedAt: '2026-09-23T00:05:00.000Z' },
      });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.updateGatewayResult('tx-1', {
        status: 'APPROVED',
        gatewayTransactionId: 'gw-1',
        updatedAt: '2026-09-23T00:05:00.000Z',
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({ status: 'APPROVED', gatewayTransactionId: 'gw-1' });
      const call = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
      expect(call.TableName).toBe(TRANSACTIONS_TABLE_NAME);
      expect(call.Key).toEqual({ transactionId: 'tx-1' });
    });

    it('updates lastGatewayCheckAt when given (lazy-poll refresh)', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { ...storedItem, status: 'PENDING', lastGatewayCheckAt: '2026-09-23T00:05:00.000Z' },
      });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.updateGatewayResult('tx-1', {
        status: 'PENDING',
        lastGatewayCheckAt: '2026-09-23T00:05:00.000Z',
        updatedAt: '2026-09-23T00:05:00.000Z',
      });

      expect(result.isOk()).toBe(true);
      const call = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
      expect(call.ExpressionAttributeValues).toMatchObject({
        ':lastGatewayCheckAt': '2026-09-23T00:05:00.000Z',
      });
    });

    it('updates only status (ERROR) when no gatewayTransactionId is given', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { ...storedItem, status: 'ERROR', updatedAt: '2026-09-23T00:05:00.000Z' },
      });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.updateGatewayResult('tx-1', {
        status: 'ERROR',
        updatedAt: '2026-09-23T00:05:00.000Z',
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().status).toBe('ERROR');
      expect(result._unsafeUnwrap().gatewayTransactionId).toBeUndefined();
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('network error'));
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.updateGatewayResult('tx-1', {
        status: 'ERROR',
        updatedAt: '2026-09-23T00:05:00.000Z',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns ValidationError when the returned Attributes have corrupt data', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: { ...storedItem, unitPriceCents: -1 } });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.updateGatewayResult('tx-1', {
        status: 'ERROR',
        updatedAt: '2026-09-23T00:05:00.000Z',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    });
  });

  describe('findById', () => {
    it('returns the transaction when the item exists', async () => {
      ddbMock.on(GetCommand).resolves({ Item: storedItem });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({ id: 'tx-1', reference: 'REF-tx-1', status: 'PENDING' });
      expect(ddbMock.commandCalls(GetCommand)[0].args[0].input).toEqual({
        TableName: TRANSACTIONS_TABLE_NAME,
        Key: { transactionId: 'tx-1' },
      });
    });

    it('returns NotFoundError when the item does not exist', async () => {
      ddbMock.on(GetCommand).resolves({});
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('missing-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('NotFound');
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(GetCommand).rejects(new Error('network error'));
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('tx-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns ValidationError when the stored item has corrupt data', async () => {
      ddbMock.on(GetCommand).resolves({ Item: { ...storedItem, unitPriceCents: -1 } });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findById('tx-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    });
  });
});
