import { Logger } from '@nestjs/common';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import {
  CUSTOMERS_EMAIL_INDEX_NAME,
  CUSTOMERS_TABLE_NAME,
  DynamoCustomerRepository,
} from './dynamo-customer.repository';

describe('DynamoCustomerRepository', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMock.reset();
  });

  describe('findById', () => {
    it('returns the customer when the item exists', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          customerId: 'cust-1',
          fullName: 'Jane Doe',
          email: 'jane.doe@example.com',
          phone: '+573001234567',
        },
      });
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findById('cust-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        id: 'cust-1',
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        phone: '+573001234567',
      });
      expect(ddbMock.commandCalls(GetCommand)[0].args[0].input).toEqual({
        TableName: CUSTOMERS_TABLE_NAME,
        Key: { customerId: 'cust-1' },
      });
    });

    it('returns NotFoundError when the item does not exist', async () => {
      ddbMock.on(GetCommand).resolves({});
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findById('missing-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('NotFound');
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(GetCommand).rejects(new Error('network error'));
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findById('cust-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns ValidationError when the stored item has corrupt data', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          customerId: 'cust-1',
          fullName: 'Jane Doe',
          email: 'not-an-email',
          phone: '+573001234567',
        },
      });
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findById('cust-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    });
  });

  describe('findByEmail', () => {
    it('returns the customer when a matching item is found via the EmailIndex GSI', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            customerId: 'cust-1',
            fullName: 'Jane Doe',
            email: 'jane.doe@example.com',
            phone: '+573001234567',
          },
        ],
      });
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findByEmail('jane.doe@example.com');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()?.id).toBe('cust-1');
      const call = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
      expect(call.TableName).toBe(CUSTOMERS_TABLE_NAME);
      expect(call.IndexName).toBe(CUSTOMERS_EMAIL_INDEX_NAME);
      expect(call.ExpressionAttributeValues).toEqual({ ':email': 'jane.doe@example.com' });
      expect(call.Limit).toBe(2);
    });

    it('returns null when the query response has no Items array at all', async () => {
      ddbMock.on(QueryCommand).resolves({});
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findByEmail('unknown@example.com');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns null when no customer matches the email', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findByEmail('unknown@example.com');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('network error'));
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findByEmail('jane.doe@example.com');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('returns ValidationError when the matched item has corrupt data', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            customerId: 'cust-1',
            fullName: 'Jane Doe',
            email: 'not-an-email',
            phone: '+573001234567',
          },
        ],
      });
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findByEmail('not-an-email');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    });

    it('logs a warning (ids only) and returns the first match when more than one item is found', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            customerId: 'cust-1',
            fullName: 'Jane Doe',
            email: 'jane.doe@example.com',
            phone: '+573001234567',
          },
          {
            customerId: 'cust-2',
            fullName: 'Jane Doe Duplicate',
            email: 'jane.doe@example.com',
            phone: '+573007654321',
          },
        ],
      });
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.findByEmail('jane.doe@example.com');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()?.id).toBe('cust-1');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('cust-1, cust-2'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('create', () => {
    const customer = {
      id: 'cust-1',
      fullName: 'Jane Doe',
      email: 'Jane.Doe@Example.com',
      phone: '+573001234567',
    };

    it('persists the customer and an email-uniqueness guard item in one transaction', async () => {
      ddbMock.on(TransactWriteCommand).resolves({});
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.create(customer);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(customer);
      const call = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input;
      expect(call.TransactItems).toEqual([
        {
          Put: {
            TableName: CUSTOMERS_TABLE_NAME,
            Item: {
              customerId: 'cust-1',
              fullName: 'Jane Doe',
              email: 'Jane.Doe@Example.com',
              phone: '+573001234567',
            },
            ConditionExpression: 'attribute_not_exists(customerId)',
          },
        },
        {
          Put: {
            TableName: CUSTOMERS_TABLE_NAME,
            // Guard item: its customerId is a synthetic, lowercase-normalized
            // "EMAIL#..." key, never a real customer id.
            Item: { customerId: 'EMAIL#jane.doe@example.com' },
            ConditionExpression: 'attribute_not_exists(customerId)',
          },
        },
      ]);
    });

    it('returns UnexpectedError when the underlying client call fails', async () => {
      ddbMock.on(TransactWriteCommand).rejects(new Error('network error'));
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.create(customer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });

    it('re-reads and returns the winning customer when two concurrent creates race on the same email', async () => {
      ddbMock.on(TransactWriteCommand).rejects(
        new TransactionCanceledException({ message: 'Transaction cancelled', $metadata: {} }),
      );
      const winner = {
        customerId: 'cust-winner',
        fullName: 'Jane Doe',
        email: 'Jane.Doe@Example.com',
        phone: '+573001234567',
      };
      ddbMock.on(QueryCommand).resolves({ Items: [winner] });
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.create(customer);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().id).toBe('cust-winner');
    });

    it('returns the original cancellation error when the race loser cannot find a winner by email', async () => {
      const cancellation = new TransactionCanceledException({ message: 'Transaction cancelled', $metadata: {} });
      ddbMock.on(TransactWriteCommand).rejects(cancellation);
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const repository = new DynamoCustomerRepository(
        ddbMock as unknown as DynamoDBDocumentClient,
      );

      const result = await repository.create(customer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Unexpected');
    });
  });
});
