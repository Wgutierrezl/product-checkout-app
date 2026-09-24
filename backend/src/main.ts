import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import { applyGlobalConfig } from './shared/bootstrap';
import type { AppConfig } from './shared/config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  applyGlobalConfig(app);

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<AppConfig['port']>('port');

  await app.listen(port);
}

void bootstrap();
