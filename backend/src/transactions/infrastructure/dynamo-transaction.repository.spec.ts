import { ConditionalCheckFailedException, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { DELIVERIES_TABLE_NAME } from '../../deliveries/infrastructure/dynamo-delivery.repository';
import { PRODUCTS_TABLE_NAME } from '../../products/infrastructure/dynamo-product.repository';
import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import {
  DynamoTransactionRepository,
  TRANSACTIONS_GATEWAY_TX_INDEX_NAME,
  TRANSACTIONS_REFERENCE_INDEX_NAME,
  TRANSACTIONS_TABLE_NAME,
} from './dynamo-transaction.repository';

function buildCancellationError(reasons: Array<{ Code?: string }>): TransactionCanceledException {
  return new TransactionCanceledException({
    message: 'Transaction cancelled',
    $metadata: {},
    CancellationReasons: reasons,
  });
}

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
    it('updates status, gatewayTransactionId, and lastGatewayCheckAt, conditioned on still being PENDING, via ReturnValues ALL_NEW (no re-read)', async () => {
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
      expect(call.ConditionExpression).toContain('=');
      expect(call.ReturnValues).toBe('ALL_NEW');
      expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
    });

    it('re-reads when the conditioned update succeeds but returns no Attributes (defensive fallback)', async () => {
      ddbMock.on(UpdateCommand).resolves({});
      ddbMock.on(GetCommand).resolves({ Item: storedItem });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.updateGatewayResult('tx-1', {
        status: 'PENDING',
        gatewayTransactionId: 'gw-1',
        updatedAt: '2026-09-23T00:05:00.000Z',
      });

      expect(result.isOk()).toBe(true);
      expect(ddbMock.commandCalls(GetCommand)).toHaveLength(1);
    });

    it('re-reads and returns the current row (not an error) when the transaction is no longer PENDING (race lost)', async () => {
      ddbMock.on(UpdateCommand).rejects(
        new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} }),
      );
      ddbMock.on(GetCommand).resolves({ Item: { ...storedItem, status: 'APPROVED', gatewayTransactionId: 'gw-winner' } });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.updateGatewayResult('tx-1', {
        status: 'PENDING',
        gatewayTransactionId: 'gw-loser',
        updatedAt: '2026-09-23T00:05:00.000Z',
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().gatewayTransactionId).toBe('gw-winner');
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

  describe('settleApproved', () => {
    const settleInput = {
      transactionId: 'tx-1',
      productId: 'prod-1',
      quantity: Quantity.create(2)._unsafeUnwrap(),
      customerId: 'cust-1',
      delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
      deliveryId: 'delivery-1',
      gatewayTransactionId: 'gw-1',
      updatedAt: '2026-09-24T00:05:00.000Z',
    };

    it('runs a 3-item atomic TransactWriteItems (transaction, stock, delivery) and returns the settled transaction', async () => {
      ddbMock.on(TransactWriteCommand).resolves({});
      ddbMock.on(GetCommand).resolves({ Item: { ...storedItem, status: 'APPROVED', gatewayTransactionId: 'gw-1' } });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.settleApproved(settleInput);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().status).toBe('APPROVED');
      const call = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
      const [transactionsItem, productsItem, deliveriesItem] = call.TransactItems!;
      expect(transactionsItem.Update!.TableName).toBe(TRANSACTIONS_TABLE_NAME);
      expect(transactionsItem.Update!.ConditionExpression).toContain('=');
      expect(transactionsItem.Update!.Key).toEqual({ transactionId: 'tx-1' });
      expect(productsItem.Update!.TableName).toBe(PRODUCTS_TABLE_NAME);
      expect(productsItem.Update!.Key).toEqual({ productId: 'prod-1' });
      expect(productsItem.Update!.ConditionExpression).toBe('stock >= :qty');
      expect(productsItem.Update!.ExpressionAttributeValues).toEqual({ ':qty': 2 });
      expect(deliveriesItem.Put!.TableName).toBe(DELIVERIES_TABLE_NAME);
      expect(deliveriesItem.Put!.ConditionExpression).toBe('attribute_not_exists(deliveryId)');
      expect(deliveriesItem.Put!.Item).toMatchObject({
        deliveryId: 'delivery-1',
        transactionId: 'tx-1',
        customerId: 'cust-1',
        address: 'Cra 1 # 2-3',
        status: 'CREATED',
      });
    });

    it('re-reads and returns the current transaction when the race loser detects the transaction condition failed', async () => {
      ddbMock.on(TransactWriteCommand).rejects(buildCancellationError([{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }, { Code: 'None' }]));
      ddbMock.on(GetCommand).resolves({ Item: { ...storedItem, status: 'APPROVED', gatewayTransactionId: 'gw-winner' } });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.settleApproved(settleInput);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().gatewayTransactionId).toBe('gw-winner');
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    it('marks the transaction APPROVED without stock/delivery when the products condition fails (oversold), via ReturnValues ALL_NEW (no re-read)', async () => {
      ddbMock.on(TransactWriteCommand).rejects(buildCancellationError([{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }, { Code: 'None' }]));
      ddbMock.on(UpdateCommand).resolves({ Attributes: { ...storedItem, status: 'APPROVED', gatewayTransactionId: 'gw-1' } });
      const errorSpy = jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation();

      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);
      const result = await repository.settleApproved(settleInput);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().status).toBe('APPROVED');
      const updateCall = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
      expect(updateCall.TableName).toBe(TRANSACTIONS_TABLE_NAME);
      expect(updateCall.ReturnValues).toBe('ALL_NEW');
      expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Oversold'));
      errorSpy.mockRestore();
    });

    it('re-reads and returns the winner when reasons[0] AND reasons[1] both fail simultaneously (reasons[0]/race takes priority over oversold)', async () => {
      ddbMock.on(TransactWriteCommand).rejects(buildCancellationError([{ Code: 'ConditionalCheckFailed' }, { Code: 'ConditionalCheckFailed' }, { Code: 'None' }]));
      ddbMock.on(GetCommand).resolves({ Item: { ...storedItem, status: 'APPROVED', gatewayTransactionId: 'gw-winner' } });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.settleApproved(settleInput);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().gatewayTransactionId).toBe('gw-winner');
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    it('retries the TransactWriteItems once for an unrecognized cancellation reason (e.g. TransactionConflict), and succeeds on the retry', async () => {
      ddbMock
        .on(TransactWriteCommand)
        .rejectsOnce(buildCancellationError([{ Code: 'TransactionConflict' }, { Code: 'None' }, { Code: 'None' }]))
        .resolves({});
      ddbMock.on(GetCommand).resolves({ Item: { ...storedItem, status: 'APPROVED', gatewayTransactionId: 'gw-1' } });
      const warnSpy = jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation();
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.settleApproved(settleInput);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().status).toBe('APPROVED');
      expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tx-1'));
      warnSpy.mockRestore();
    });

    it('returns UnexpectedError (masked 500) when the retry also fails with an unrecognized cancellation reason', async () => {
      ddbMock.on(TransactWriteCommand).rejects(buildCancellationError([{ Code: 'TransactionConflict' }, { Code: 'None' }, { Code: 'None' }]));
      const errorSpy = jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation();
      jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation();
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.settleApproved(settleInput);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
      expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(2);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('tx-1'));
      errorSpy.mockRestore();
    });

    it('returns UnexpectedError when the fallback oversold update itself fails unexpectedly', async () => {
      ddbMock.on(TransactWriteCommand).rejects(buildCancellationError([{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }, { Code: 'None' }]));
      ddbMock.on(UpdateCommand).rejects(new Error('network error'));
      jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation();
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.settleApproved(settleInput);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns UnexpectedError when the underlying transact-write client call fails for a non-cancellation reason', async () => {
      ddbMock.on(TransactWriteCommand).rejects(new Error('network error'));
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.settleApproved(settleInput);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('treats a TransactionCanceledException with no CancellationReasons at all as an unrecognized reason (retries once)', async () => {
      ddbMock
        .on(TransactWriteCommand)
        .rejectsOnce(new TransactionCanceledException({ message: 'Transaction cancelled', $metadata: {} }))
        .resolves({});
      ddbMock.on(GetCommand).resolves({ Item: { ...storedItem, status: 'APPROVED' } });
      jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation();
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.settleApproved(settleInput);

      expect(result.isOk()).toBe(true);
      expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(2);
    });
  });

  describe('finalizeNonApproved', () => {
    it('conditionally updates the status to a terminal non-approved value via ReturnValues ALL_NEW (no re-read)', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: { ...storedItem, status: 'DECLINED' } });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.finalizeNonApproved({
        transactionId: 'tx-1',
        status: 'DECLINED',
        gatewayTransactionId: 'gw-1',
        updatedAt: '2026-09-24T00:05:00.000Z',
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().status).toBe('DECLINED');
      const call = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
      expect(call.ConditionExpression).toContain('=');
      expect(call.ReturnValues).toBe('ALL_NEW');
      expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
    });

    it('re-reads and returns the current transaction on a benign race (already finalized)', async () => {
      ddbMock.on(UpdateCommand).rejects(
        new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} }),
      );
      ddbMock.on(GetCommand).resolves({ Item: { ...storedItem, status: 'APPROVED' } });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.finalizeNonApproved({
        transactionId: 'tx-1',
        status: 'ERROR',
        updatedAt: '2026-09-24T00:05:00.000Z',
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().status).toBe('APPROVED');
    });

    it('returns UnexpectedError for a non-conditional client failure', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('network error'));
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.finalizeNonApproved({
        transactionId: 'tx-1',
        status: 'VOIDED',
        updatedAt: '2026-09-24T00:05:00.000Z',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });
  });

  describe('touchLastGatewayCheckAt', () => {
    it('updates only lastGatewayCheckAt', async () => {
      ddbMock.on(UpdateCommand).resolves({});
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.touchLastGatewayCheckAt('tx-1', '2026-09-24T00:05:00.000Z');

      expect(result.isOk()).toBe(true);
      const call = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
      expect(call.Key).toEqual({ transactionId: 'tx-1' });
      expect(call.ExpressionAttributeValues).toEqual({ ':lastGatewayCheckAt': '2026-09-24T00:05:00.000Z' });
    });

    it('returns UnexpectedError when the client call fails', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('network error'));
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.touchLastGatewayCheckAt('tx-1', '2026-09-24T00:05:00.000Z');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });
  });

  describe('findByGatewayTransactionId', () => {
    it('logs a warning and returns the first match when more than one transaction matches (invariant violation)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [storedItem, { ...storedItem, transactionId: 'tx-2' }] });
      const warnSpy = jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation();
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByGatewayTransactionId('gw-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({ id: 'tx-1' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tx-1, tx-2'));
      warnSpy.mockRestore();
    });

    it('returns the matching transaction via GatewayTxIndex', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [storedItem] });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByGatewayTransactionId('gw-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({ id: 'tx-1' });
      const call = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
      expect(call.IndexName).toBe(TRANSACTIONS_GATEWAY_TX_INDEX_NAME);
    });

    it('returns null (not an error) when no transaction matches', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByGatewayTransactionId('unknown-gw');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns UnexpectedError when the client call fails', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('network error'));
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByGatewayTransactionId('gw-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });
  });

  describe('findByReference', () => {
    it('returns the matching transaction via ReferenceIndex', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [storedItem] });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByReference('REF-tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({ id: 'tx-1' });
      const call = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
      expect(call.IndexName).toBe(TRANSACTIONS_REFERENCE_INDEX_NAME);
    });

    it('never inlines the "reference" attribute name directly (it is a reserved DynamoDB keyword)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [storedItem] });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      await repository.findByReference('REF-tx-1');

      const call = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
      expect(call.KeyConditionExpression).not.toContain('reference =');
      expect(call.ExpressionAttributeNames).toBeDefined();
      const placeholder = Object.keys(call.ExpressionAttributeNames!)[0];
      expect(call.ExpressionAttributeNames![placeholder]).toBe('reference');
      expect(call.KeyConditionExpression).toBe(`${placeholder} = :value`);
    });

    it('treats a response with no Items field at all as no match (defensive fallback)', async () => {
      ddbMock.on(QueryCommand).resolves({});
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByReference('REF-unknown');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns ValidationError when the matched item has corrupt data', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [{ ...storedItem, unitPriceCents: -1 }] });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByReference('REF-tx-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    });

    it('returns null (not an error) when no transaction matches', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const repository = new DynamoTransactionRepository(ddbMock as unknown as DynamoDBDocumentClient);

      const result = await repository.findByReference('unknown-ref');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });
  });
});
