/**
 * Idempotent local seed script for the Products table.
 *
 * Creates the `Products` table on DynamoDB Local (if it doesn't already exist)
 * and puts a fixed catalog of 6 sample products keyed by stable UUIDs, so
 * re-running the script overwrites the same items instead of duplicating them.
 *
 * Only the Products table is created here — Customers/Deliveries/Transactions
 * table creation is deferred to the PRs that introduce those repositories
 * (see design.md "Local Dev" note; this script will be extended there).
 *
 * Usage: npm run seed
 */
import {
  CreateTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

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
];

async function ensureProductsTable(client: DynamoDBClient): Promise<void> {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: PRODUCTS_TABLE_NAME,
        AttributeDefinitions: [{ AttributeName: 'productId', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'productId', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
  } catch (error) {
    if (!(error instanceof ResourceInUseException)) {
      throw error;
    }
  }
}

async function seedProducts(): Promise<void> {
  const client = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT });
  const documentClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  await ensureProductsTable(client);

  for (const product of SEED_PRODUCTS) {
    await documentClient.send(new PutCommand({ TableName: PRODUCTS_TABLE_NAME, Item: product }));
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${SEED_PRODUCTS.length} products into "${PRODUCTS_TABLE_NAME}".`);
}

seedProducts().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed the Products table:', error);
  process.exitCode = 1;
});
