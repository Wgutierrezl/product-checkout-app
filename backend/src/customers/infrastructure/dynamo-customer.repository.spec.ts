import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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
  });
});
