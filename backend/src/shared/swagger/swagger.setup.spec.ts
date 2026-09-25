import { SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

import { buildSwaggerDocument, setupSwagger } from './swagger.setup';

jest.mock('@nestjs/swagger', () => {
  const actual = jest.requireActual('@nestjs/swagger');
  return {
    ...actual,
    SwaggerModule: {
      createDocument: jest.fn().mockReturnValue({ paths: {} }),
      setup: jest.fn(),
    },
  };
});

describe('setupSwagger', () => {
  it('creates the OpenAPI document and mounts it at /docs', () => {
    const app = {} as INestApplication;

    setupSwagger(app);

    expect(SwaggerModule.createDocument).toHaveBeenCalledWith(
      app,
      expect.objectContaining({ info: expect.objectContaining({ title: 'Product Checkout API' }) }),
    );
    expect(SwaggerModule.setup).toHaveBeenCalledWith('docs', app, { paths: {} });
  });

  it('registers a Bearer auth security scheme for the accounts module', () => {
    const app = {} as INestApplication;

    setupSwagger(app);

    expect(SwaggerModule.createDocument).toHaveBeenCalledWith(
      app,
      expect.objectContaining({
        components: expect.objectContaining({
          securitySchemes: expect.objectContaining({
            bearer: expect.objectContaining({ type: 'http', scheme: 'bearer' }),
          }),
        }),
      }),
    );
  });
});

describe('buildSwaggerDocument', () => {
  it('builds the same document setupSwagger mounts, for reuse by an export script', () => {
    const app = {} as INestApplication;

    const document = buildSwaggerDocument(app);

    expect(SwaggerModule.createDocument).toHaveBeenCalledWith(
      app,
      expect.objectContaining({ info: expect.objectContaining({ title: 'Product Checkout API' }) }),
    );
    expect(document).toEqual({ paths: {} });
  });
});
