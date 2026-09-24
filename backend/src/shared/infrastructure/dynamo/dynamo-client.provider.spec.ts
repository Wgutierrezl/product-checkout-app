import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { createDynamoDocumentClient, dynamoDocumentClientProvider } from './dynamo-client.provider';

describe('createDynamoDocumentClient', () => {
  it('creates a DynamoDBDocumentClient configured with the given region', async () => {
    const client = createDynamoDocumentClient({ region: 'us-east-1' });

    expect(client).toBeInstanceOf(DynamoDBDocumentClient);
    await expect(client.config.region()).resolves.toBe('us-east-1');
  });

  it('points the client at a custom endpoint when provided (DynamoDB Local)', async () => {
    const client = createDynamoDocumentClient({
      region: 'us-east-1',
      endpoint: 'http://localhost:8000',
    });

    const endpoint = await client.config.endpoint?.();

    expect(endpoint).toMatchObject({ hostname: 'localhost', port: 8000, protocol: 'http:' });
  });
});

describe('dynamoDocumentClientProvider', () => {
  it('reads aws config from ConfigService and builds a document client', async () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue({ region: 'us-east-1', dynamoEndpoint: undefined }),
    };
    const factory = dynamoDocumentClientProvider as { useFactory: (cs: typeof configService) => DynamoDBDocumentClient };

    const client = factory.useFactory(configService);

    expect(configService.getOrThrow).toHaveBeenCalledWith('aws');
    expect(client).toBeInstanceOf(DynamoDBDocumentClient);
    await expect(client.config.region()).resolves.toBe('us-east-1');
  });
});
