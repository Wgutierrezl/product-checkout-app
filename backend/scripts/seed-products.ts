/**
 * Idempotent local table-creation + seed script for DynamoDB Local.
 *
 * Creates the `Products`, `Customers`, and `Deliveries` tables (with their
 * GSIs) if they don't already exist, and puts a fixed catalog of 7 sample
 * products (including one out-of-stock item, stock 0, to demo the catalog's
 * "sold out" UI state) keyed by stable UUIDs, so re-running the script
 * overwrites the same items instead of duplicating them.
 *
 * Customers and Deliveries are only table-created here, not seeded — they're
 * populated by the checkout flow itself (PR5/PR6), so there's no fixed seed
 * data for them. `Transactions` table creation is deferred to PR5, which
 * introduces the transaction repository.
 *
 * Usage: npm run seed
 */
import {
  CreateTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import {
  CUSTOMERS_EMAIL_INDEX_NAME,
  CUSTOMERS_TABLE_NAME,
} from '../src/customers/infrastructure/dynamo-customer.repository';
import {
  DELIVERIES_TABLE_NAME,
  DELIVERIES_TRANSACTION_ID_INDEX_NAME,
} from '../src/deliveries/infrastructure/dynamo-delivery.repository';
import { PRODUCTS_TABLE_NAME } from '../src/products/infrastructure/dynamo-product.repository';

const REGION = process.env.AWS_REGION ?? 'us-east-1';
// Defaults to DynamoDB Local's docker-compose port for local seeding; set
// DYNAMO_ENDPOINT to omit this and target a real AWS endpoint instead.
const ENDPOINT = process.env.DYNAMO_ENDPOINT ?? 'http://localhost:8000';

interface SeedProductItem {
  productId: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
}

const SEED_PRODUCTS: SeedProductItem[] = [
  {
    productId: 'f749caf9-96dd-427d-abdd-543bf3ecafe9',
    name: 'Wireless Over-Ear Headphones',
    description: 'Noise-cancelling over-ear headphones with 30h battery life.',
    priceCents: 14_990_000,
    stock: 25,
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&fm=webp',
  },
  {
    productId: '21a35f72-5941-42b4-9df6-8dab1e017c1b',
    name: 'Compact Mechanical Keyboard',
    description: 'RGB backlit 75% mechanical keyboard with hot-swappable switches.',
    priceCents: 21_990_000,
    stock: 15,
    imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&fm=webp',
  },
  {
    productId: 'df6e82cd-ebd5-41e6-8bcc-7b6113f68088',
    name: 'FitTrack 2 Smartwatch',
    description: 'Heart-rate and sleep tracking smartwatch with a 7-day battery life.',
    priceCents: 32_990_000,
    stock: 10,
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&fm=webp',
  },
  {
    productId: '819683ec-14f8-46c4-89e0-ad8a6b463539',
    name: 'SoundWave Portable Bluetooth Speaker',
    description: 'IPX7 waterproof portable speaker with 12h of playtime.',
    priceCents: 12_990_000,
    stock: 30,
    imageUrl: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&fm=webp',
  },
  {
    productId: 'a689d0fb-a89f-4a4c-a166-acd36c592ae4',
    name: 'Precision X Gaming Mouse',
    description: '16000 DPI optical gaming mouse with 6 programmable buttons.',
    priceCents: 8_990_000,
    stock: 40,
    imageUrl: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=600&fm=webp',
  },
  {
    productId: '3af63dd5-a3fc-42ee-8267-ab161b84520b',
    name: 'FastCharge 20000mAh Power Bank',
    description: 'High-capacity power bank with dual USB-C PD output.',
    priceCents: 9_990_000,
    stock: 20,
    imageUrl: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&fm=webp',
  },
  {
    // Stock 0 on purpose: demos the "out of stock" UI state on the product page.
    productId: 'ead7e452-2120-419d-b923-82ead9700648',
    name: 'RetroPlay Handheld Console',
    description: 'Limited-edition handheld console, currently sold out.',
    priceCents: 24_990_000,
    stock: 0,
    imageUrl: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=600&fm=webp',
  },
];

async function createTableIfMissing(
  client: DynamoDBClient,
  command: CreateTableCommand,
): Promise<void> {
  try {
    await client.send(command);
  } catch (error) {
    if (!(error instanceof ResourceInUseException)) {
      throw error;
    }
  }
}

async function ensureProductsTable(client: DynamoDBClient): Promise<void> {
  await createTableIfMissing(
    client,
    new CreateTableCommand({
      TableName: PRODUCTS_TABLE_NAME,
      AttributeDefinitions: [{ AttributeName: 'productId', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'productId', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
}

async function ensureCustomersTable(client: DynamoDBClient): Promise<void> {
  await createTableIfMissing(
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

async function ensureDeliveriesTable(client: DynamoDBClient): Promise<void> {
  await createTableIfMissing(
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

async function seedProducts(): Promise<void> {
  const client = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT });
  const documentClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  await ensureProductsTable(client);
  await ensureCustomersTable(client);
  await ensureDeliveriesTable(client);

  for (const product of SEED_PRODUCTS) {
    await documentClient.send(new PutCommand({ TableName: PRODUCTS_TABLE_NAME, Item: product }));
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${SEED_PRODUCTS.length} products into "${PRODUCTS_TABLE_NAME}". ` +
      `Ensured "${CUSTOMERS_TABLE_NAME}" and "${DELIVERIES_TABLE_NAME}" tables exist (no seed data).`,
  );
}

seedProducts().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed local DynamoDB tables:', error);
  process.exitCode = 1;
});
