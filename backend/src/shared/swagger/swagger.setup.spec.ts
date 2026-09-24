import { SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

import { setupSwagger } from './swagger.setup';

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
});
