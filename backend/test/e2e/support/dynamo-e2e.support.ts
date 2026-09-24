/**
 * Table lifecycle + fixed seed data for the E2E suite. Tables are DROPPED
 * and RECREATED at the start of every run (`cleanAndSeedTables`) so the
 * suite never depends on leftover state from a previous run or from
 * `npm run seed`'s own fixed catalog. Table/index names are imported from
 * the production repositories so schema drift is impossible.
 */
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import {
  CUSTOMERS_EMAIL_INDEX_NAME,
  CUSTOMERS_TABLE_NAME,
} from '../../../src/customers/infrastructure/dynamo-customer.repository';
import {
  DELIVERIES_TABLE_NAME,
  DELIVERIES_TRANSACTION_ID_INDEX_NAME,
} from '../../../src/deliveries/infrastructure/dynamo-delivery.repository';
import { PRODUCTS_TABLE_NAME } from '../../../src/products/infrastructure/dynamo-product.repository';
import {
  TRANSACTIONS_GATEWAY_TX_INDEX_NAME,
  TRANSACTIONS_REFERENCE_INDEX_NAME,
  TRANSACTIONS_TABLE_NAME,
} from '../../../src/transactions/infrastructure/dynamo-transaction.repository';

export const E2E_AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
export const E2E_DYNAMO_ENDPOINT = process.env.DYNAMO_ENDPOINT ?? 'http://localhost:8000';

export const PRODUCT_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const PRODUCT_A_STOCK = 5;
export const PRODUCT_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const PRODUCT_B_STOCK = 1;

const ALL_TABLE_NAMES = [
  PRODUCTS_TABLE_NAME,
  CUSTOMERS_TABLE_NAME,
  DELIVERIES_TABLE_NAME,
  TRANSACTIONS_TABLE_NAME,
];

function createRawClient(): DynamoDBClient {
  return new DynamoDBClient({ region: E2E_AWS_REGION, endpoint: E2E_DYNAMO_ENDPOINT });
}

export function createE2eDocumentClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(createRawClient(), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

async function dropTableIfExists(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error;
    }
  }
}

async function createTableRetryingInUse(
  client: DynamoDBClient,
  command: CreateTableCommand,
  attemptsLeft = 5,
): Promise<void> {
  try {
    await client.send(command);
  } catch (error) {
    if (error instanceof ResourceInUseException && attemptsLeft > 0) {
      // DynamoDB Local can briefly report the table as still being deleted;
      // a short backoff-and-retry avoids flaking the whole suite on that.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await createTableRetryingInUse(client, command, attemptsLeft - 1);
      return;
    }
    throw error;
  }
}

async function recreateProductsTable(client: DynamoDBClient): Promise<void> {
  await createTableRetryingInUse(
    client,
    new CreateTableCommand({
      TableName: PRODUCTS_TABLE_NAME,
      AttributeDefinitions: [{ AttributeName: 'productId', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'productId', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
}

async function recreateCustomersTable(client: DynamoDBClient): Promise<void> {
  await createTableRetryingInUse(
    client,
    new CreateTableCommand({
      TableName: CUSTOMERS_TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: 'customerId', AttributeType: 'S' },
        { AttributeName: 'email', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'customerId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: CUSTOMERS_EMAIL_INDEX_NAME,
          KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
}

async function recreateDeliveriesTable(client: DynamoDBClient): Promise<void> {
  await createTableRetryingInUse(
    client,
    new CreateTableCommand({
      TableName: DELIVERIES_TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: 'deliveryId', AttributeType: 'S' },
        { AttributeName: 'transactionId', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'deliveryId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: DELIVERIES_TRANSACTION_ID_INDEX_NAME,
          KeySchema: [{ AttributeName: 'transactionId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
}

async function recreateTransactionsTable(client: DynamoDBClient): Promise<void> {
  await createTableRetryingInUse(
    client,
    new CreateTableCommand({
      TableName: TRANSACTIONS_TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: 'transactionId', AttributeType: 'S' },
        { AttributeName: 'reference', AttributeType: 'S' },
        { AttributeName: 'gatewayTransactionId', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'transactionId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: TRANSACTIONS_REFERENCE_INDEX_NAME,
          KeySchema: [{ AttributeName: 'reference', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: TRANSACTIONS_GATEWAY_TX_INDEX_NAME,
          KeySchema: [{ AttributeName: 'gatewayTransactionId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
}

async function seedProducts(documentClient: DynamoDBDocumentClient): Promise<void> {
  await documentClient.send(
    new PutCommand({
      TableName: PRODUCTS_TABLE_NAME,
      Item: {
        productId: PRODUCT_A_ID,
        name: 'E2E Test Product A',
        description: 'Seeded product with enough stock for the happy-path flow.',
        priceCents: 5_000_000,
        stock: PRODUCT_A_STOCK,
        imageUrl: 'https://example.test/product-a.jpg',
      },
    }),
  );
  await documentClient.send(
    new PutCommand({
      TableName: PRODUCTS_TABLE_NAME,
      Item: {
        productId: PRODUCT_B_ID,
        name: 'E2E Test Product B',
        description: 'Seeded product with minimal stock for the insufficient-stock scenario.',
        priceCents: 3_000_000,
        stock: PRODUCT_B_STOCK,
        imageUrl: 'https://example.test/product-b.jpg',
      },
    }),
  );
}

/**
 * Drops and recreates all 4 tables, then seeds the 2 fixed test products.
 * Call once from a top-level `beforeAll` before any Nest app is built.
 */
export async function cleanAndSeedTables(): Promise<void> {
  const client = createRawClient();

  for (const tableName of ALL_TABLE_NAMES) {
    await dropTableIfExists(client, tableName);
  }

  await recreateProductsTable(client);
  await recreateCustomersTable(client);
  await recreateDeliveriesTable(client);
  await recreateTransactionsTable(client);

  const documentClient = createE2eDocumentClient();
  await seedProducts(documentClient);
}

/**
 * Test-only lookup: the API never exposes `customerId` on any response DTO
 * (see `TransactionResponseDto`/`DeliveryResponseDto`), so the masked
 * `GET /customers/:id` scenario resolves the id directly off the
 * `EmailIndex` GSI instead.
 */
export async function findCustomerIdByEmail(email: string): Promise<string> {
  const documentClient = createE2eDocumentClient();
  const result = await documentClient.send(
    new QueryCommand({
      TableName: CUSTOMERS_TABLE_NAME,
      IndexName: CUSTOMERS_EMAIL_INDEX_NAME,
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0] as { customerId: string } | undefined;
  if (!item) {
    throw new Error(`E2E setup error: no customer found for email ${email}`);
  }
  return item.customerId;
}
