import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ConfigService } from '@nestjs/config';
import type { Provider } from '@nestjs/common';

import type { AppConfig } from '../../config/configuration';

export const DYNAMO_DOCUMENT_CLIENT = Symbol('DYNAMO_DOCUMENT_CLIENT');

export interface DynamoClientOptions {
  region: string;
  endpoint?: string;
}

export function createDynamoDocumentClient(
  options: DynamoClientOptions,
): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: options.region,
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export const dynamoDocumentClientProvider: Provider = {
  provide: DYNAMO_DOCUMENT_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const aws = configService.getOrThrow<AppConfig['aws']>('aws');
    return createDynamoDocumentClient({ region: aws.region, endpoint: aws.dynamoEndpoint });
  },
};
