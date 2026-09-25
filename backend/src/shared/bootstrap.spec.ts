import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { applyGlobalConfig } from './bootstrap';
import { DomainErrorFilter } from './errors/http-exception.filter';
import { setupSwagger } from './swagger/swagger.setup';

jest.mock('./swagger/swagger.setup', () => ({
  setupSwagger: jest.fn(),
}));

function createFakeApp(corsOrigins: string[]) {
  const configService = {
    getOrThrow: jest.fn().mockReturnValue({ allowedOrigins: corsOrigins }),
  };
  const app = {
    use: jest.fn(),
    enableCors: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalFilters: jest.fn(),
    get: jest.fn().mockReturnValue(configService),
  } as unknown as INestApplication & Record<string, jest.Mock>;

  return { app, configService };
}

describe('applyGlobalConfig', () => {
  it('wires helmet, cors, validation pipe, error filter and swagger', () => {
    const { app, configService } = createFakeApp(['http://localhost:5173']);

    applyGlobalConfig(app);

    expect(app.get).toHaveBeenCalledWith(ConfigService);
    expect(configService.getOrThrow).toHaveBeenCalledWith('cors');
    expect(app.use).toHaveBeenCalledWith(expect.any(Function));
    expect(app.enableCors).toHaveBeenCalledWith({ origin: ['http://localhost:5173'], maxAge: 600 });
    expect(app.useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
    expect(app.useGlobalFilters).toHaveBeenCalledWith(expect.any(DomainErrorFilter));
    expect(setupSwagger).toHaveBeenCalledWith(app);
  });

  it('forwards the configured allowed origins for a different environment', () => {
    const { app } = createFakeApp(['https://checkout.example.com']);

    applyGlobalConfig(app);

    expect(app.enableCors).toHaveBeenCalledWith({ origin: ['https://checkout.example.com'], maxAge: 600 });
  });
});
