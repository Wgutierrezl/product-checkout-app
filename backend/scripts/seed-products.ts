/**
 * Idempotent product-seeding script, safe against both DynamoDB Local and
 * real AWS.
 *
 * Local (DYNAMO_ENDPOINT set, e.g. `docker-compose`'s DynamoDB Local):
 * creates the `Products`, `Customers`, and `Deliveries` tables (with their
 * GSIs) if they don't already exist, then seeds products.
 *
 * Real AWS (DYNAMO_ENDPOINT unset, e.g. deploy.yml's post-`cdk deploy`
 * step): table creation is skipped — `DataStack` already created all 4
 * tables — and the script only PutItems into them. Attempting
 * CreateTableCommand against real tables would be redundant at best and
 * risk an unrelated permissions error at worst (the Lambda role deploy.yml
 * runs this under has no `dynamodb:CreateTable` grant, by design — least
 * privilege).
 *
 * Puts a fixed catalog of 12 sample products (including one out-of-stock
 * item, stock 0, to demo the catalog's "sold out" UI state) keyed by stable
 * UUIDs, so re-running the script overwrites the same items instead of
 * duplicating them.
 *
 * Customers, Deliveries, and Transactions are only table-created here (local
 * only), never seeded — they're populated by the checkout flow itself.
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
import {
  TRANSACTIONS_GATEWAY_TX_INDEX_NAME,
  TRANSACTIONS_REFERENCE_INDEX_NAME,
  TRANSACTIONS_TABLE_NAME,
} from '../src/transactions/infrastructure/dynamo-transaction.repository';

const REGION = process.env.AWS_REGION ?? 'us-east-1';
// Unset by default — the AWS SDK then targets real regional DynamoDB
// endpoints. Set DYNAMO_ENDPOINT (e.g. DynamoDB Local's docker-compose
// port) to override it for local development only.
const ENDPOINT = process.env.DYNAMO_ENDPOINT;

/** True for DynamoDB Local (table creation needed); false for real AWS (DataStack already created the tables). */
export function isLocalDynamoEndpoint(endpoint: string | undefined): boolean {
  return Boolean(endpoint);
}

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
  {
    productId: 'b6137f0d-d78c-4e61-9f7f-abfde792b65b',
    name: 'AirBuds Pro Wireless Earbuds',
    description: 'True wireless earbuds with active noise cancellation and a 24h charging case.',
    priceCents: 25_990_000,
    stock: 28,
    imageUrl: 'https://images.unsplash.com/photo-1505236273191-1dce886b01e9?w=600&fm=webp',
  },
  {
    productId: '98744d3c-994b-4118-bf85-ea8770a0eac1',
    name: 'ExtremeCam 4K Action Camera',
    description: '4K Ultra HD action camera with waterproof housing for extreme sports.',
    priceCents: 34_990_000,
    stock: 12,
    imageUrl: 'https://images.unsplash.com/photo-1562878671-b3efe27953b9?w=600&fm=webp',
  },
  {
    productId: 'd3e5bcfb-7dc2-42c3-8c0e-4950601b8204',
    name: 'HubMax 7-in-1 USB-C Hub',
    description: '7-in-1 USB-C hub with HDMI, USB 3.0, and 100W power delivery passthrough.',
    priceCents: 8_990_000,
    stock: 22,
    imageUrl: 'https://images.unsplash.com/photo-1760376789487-994070337c76?w=600&fm=webp',
  },
  {
    productId: 'be710685-8b93-460f-8f98-0a183cfa3e37',
    name: 'DataVault 1TB Portable SSD',
    description: '1TB portable SSD with USB-C 3.2 transfer speeds up to 1050MB/s.',
    priceCents: 39_990_000,
    stock: 18,
    imageUrl: 'https://images.unsplash.com/photo-1518547606470-00ac2ae882af?w=600&fm=webp',
  },
  {
    productId: 'bc265a08-df70-445e-bdc7-f60852fb585b',
    name: 'PageTurn E-Reader',
    description: '6-inch e-reader with a glare-free display and weeks of battery life.',
    priceCents: 59_990_000,
    stock: 9,
    imageUrl: 'https://images.unsplash.com/photo-1500697017927-23abd276362a?w=600&fm=webp',
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

async function ensureTransactionsTable(client: DynamoDBClient): Promise<void> {
  await createTableIfMissing(
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

export interface SeedProductsOptions {
  /** true = DynamoDB Local (create tables first); false = real AWS (DataStack owns table lifecycle). */
  manageLocalTables: boolean;
}

export async function seedProducts(
  client: DynamoDBClient,
  documentClient: DynamoDBDocumentClient,
  options: SeedProductsOptions,
): Promise<void> {
  if (options.manageLocalTables) {
    await ensureProductsTable(client);
    await ensureCustomersTable(client);
    await ensureDeliveriesTable(client);
    await ensureTransactionsTable(client);
  }

  for (const product of SEED_PRODUCTS) {
    await documentClient.send(new PutCommand({ TableName: PRODUCTS_TABLE_NAME, Item: product }));
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${SEED_PRODUCTS.length} products into "${PRODUCTS_TABLE_NAME}". ` +
      (options.manageLocalTables
        ? `Ensured "${CUSTOMERS_TABLE_NAME}", "${DELIVERIES_TABLE_NAME}", and "${TRANSACTIONS_TABLE_NAME}" tables exist (no seed data).`
        : `Skipped table creation (real AWS — DataStack already owns "${CUSTOMERS_TABLE_NAME}", ` +
          `"${DELIVERIES_TABLE_NAME}", and "${TRANSACTIONS_TABLE_NAME}").`),
  );
}

async function main(): Promise<void> {
  const client = new DynamoDBClient({ region: REGION, ...(ENDPOINT ? { endpoint: ENDPOINT } : {}) });
  const documentClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  await seedProducts(client, documentClient, { manageLocalTables: isLocalDynamoEndpoint(ENDPOINT) });
}

// Only auto-run when executed directly (`npm run seed`/`ts-node`), not when
// imported by tests.
if (require.main === module) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Failed to seed products:', error);
    process.exitCode = 1;
  });
}
