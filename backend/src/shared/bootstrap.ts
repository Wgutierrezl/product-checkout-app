import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import type { AppConfig } from './config/configuration';
import { DomainErrorFilter } from './errors/http-exception.filter';
import { setupSwagger } from './swagger/swagger.setup';

export function applyGlobalConfig(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const cors = configService.getOrThrow<AppConfig['cors']>('cors');

  app.use(helmet());
  // maxAge lets browsers cache a preflight for 10 minutes instead of
  // repeating it before every non-simple request (e.g. each status poll).
  app.enableCors({ origin: cors.allowedOrigins, maxAge: 600 });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new DomainErrorFilter());
  // Intentionally public in every environment, including production: the take-home
  // brief requires a publicly reachable Swagger URL in the README.
  setupSwagger(app);
}
