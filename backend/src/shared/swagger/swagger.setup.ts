import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

const SWAGGER_CONFIG = new DocumentBuilder()
  .setTitle('Product Checkout API')
  .setDescription(
    'Backend API for product checkout: catalog, payment acceptance, transactions, customers, deliveries.',
  )
  .setVersion('0.1.0')
  .build();

/**
 * Builds the OpenAPI document without mounting it — reused by both
 * `setupSwagger` (serves it at `/docs` + `/docs-json`) and the standalone
 * `npm run swagger:export` script (writes it to `openapi.json` for
 * README/Postman import, without needing a running HTTP server).
 */
export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, SWAGGER_CONFIG);
}

export function setupSwagger(app: INestApplication): void {
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('docs', app, document);
}
