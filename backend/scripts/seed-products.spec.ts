import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { PRODUCTS_TABLE_NAME } from '../src/products/infrastructure/dynamo-product.repository';
import { isLocalDynamoEndpoint, seedProducts } from './seed-products';

describe('isLocalDynamoEndpoint', () => {
  it('is true when a DynamoDB Local endpoint is configured', () => {
    expect(isLocalDynamoEndpoint('http://localhost:8000')).toBe(true);
  });

  it('is false when unset — real AWS, DataStack already created the tables', () => {
    expect(isLocalDynamoEndpoint(undefined)).toBe(false);
  });
});

describe('seedProducts', () => {
  const ddbMock = mockClient(DynamoDBClient);
  const docMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMock.reset();
    docMock.reset();
    docMock.on(PutCommand).resolves({});
  });

  it('creates the 5 tables before seeding when manageLocalTables is true (DynamoDB Local)', async () => {
    await seedProducts(ddbMock as unknown as DynamoDBClient, docMock as unknown as DynamoDBDocumentClient, {
      manageLocalTables: true,
    });

    expect(ddbMock.commandCalls(CreateTableCommand)).toHaveLength(5);
    expect(docMock.commandCalls(PutCommand)).toHaveLength(12);
    expect(docMock.commandCalls(PutCommand)[0].args[0].input.TableName).toBe(PRODUCTS_TABLE_NAME);
  });

  it('skips table creation and only PutItems when manageLocalTables is false (real AWS)', async () => {
    await seedProducts(ddbMock as unknown as DynamoDBClient, docMock as unknown as DynamoDBDocumentClient, {
      manageLocalTables: false,
    });

    expect(ddbMock.commandCalls(CreateTableCommand)).toHaveLength(0);
    expect(docMock.commandCalls(PutCommand)).toHaveLength(12);
  });
});
