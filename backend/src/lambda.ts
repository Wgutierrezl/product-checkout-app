import 'reflect-metadata';

import serverlessExpress from '@codegenie/serverless-express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Handler } from 'aws-lambda';
import express from 'express';

import { applyGlobalConfig } from './shared/bootstrap';
import { loadSecretsFromSsm } from './shared/config/ssm-bootstrap';

let cachedHandler: Handler;

async function bootstrapServer(): Promise<Handler> {
  await loadSecretsFromSsm();

  // Loaded only after the SSM secrets are in process.env: importing AppModule
  // runs ConfigModule.forRoot's environment validation at module load time,
  // so a static import would validate before the secrets exist.
  const { AppModule } = await import('./app.module');

  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  applyGlobalConfig(app);
  await app.init();

  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (event, context, callback) => {
  cachedHandler ??= await bootstrapServer();
  return cachedHandler(event, context, callback);
};
