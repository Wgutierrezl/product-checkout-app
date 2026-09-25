import 'reflect-metadata';

import serverlessExpress from '@codegenie/serverless-express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Handler } from 'aws-lambda';
import express from 'express';

import { AppModule } from './app.module';
import { applyGlobalConfig } from './shared/bootstrap';
import { loadSecretsFromSsm } from './shared/config/ssm-bootstrap';

let cachedHandler: Handler;

async function bootstrapServer(): Promise<Handler> {
  await loadSecretsFromSsm();

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
