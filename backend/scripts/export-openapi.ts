/**
 * Writes the full OpenAPI document to `openapi.json` at the repo root of
 * `backend/`, for README linking / Postman import, without needing a running
 * HTTP server. Reuses the exact same document `setupSwagger` mounts at
 * `/docs-json` (see `buildSwaggerDocument`), so the two can never drift.
 *
 * Usage: npm run swagger:export
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { buildSwaggerDocument } from '../src/shared/swagger/swagger.setup';

const OUTPUT_PATH = join(__dirname, '..', 'openapi.json');

async function exportOpenApiDocument(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildSwaggerDocument(app);
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();

  // eslint-disable-next-line no-console
  console.log(`Wrote OpenAPI document to ${OUTPUT_PATH}`);
}

exportOpenApiDocument().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to export the OpenAPI document:', error);
  process.exitCode = 1;
});
