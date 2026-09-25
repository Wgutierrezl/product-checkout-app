import { DEFAULT_E2E_DYNAMO_ENDPOINT, resolveE2eDynamoEndpoint } from './e2e-dynamo-endpoint';

describe('resolveE2eDynamoEndpoint', () => {
  it('defaults to a dedicated DynamoDB Local on port 8001', () => {
    expect(DEFAULT_E2E_DYNAMO_ENDPOINT).toBe('http://localhost:8001');
    expect(resolveE2eDynamoEndpoint({})).toBe('http://localhost:8001');
  });

  it('uses E2E_DYNAMO_ENDPOINT when it is set', () => {
    expect(resolveE2eDynamoEndpoint({ E2E_DYNAMO_ENDPOINT: 'http://dynamodb-e2e:8002' })).toBe(
      'http://dynamodb-e2e:8002',
    );
  });

  it('ignores the app-level DYNAMO_ENDPOINT so it never inherits the dev database', () => {
    expect(resolveE2eDynamoEndpoint({ DYNAMO_ENDPOINT: 'http://localhost:8000' })).toBe('http://localhost:8001');
  });

  it.each(['http://localhost:8000', 'http://127.0.0.1:8000/', 'http://dynamodb:8000'])(
    'refuses %s, the port the dev database listens on',
    (endpoint) => {
      expect(() => resolveE2eDynamoEndpoint({ E2E_DYNAMO_ENDPOINT: endpoint })).toThrow(
        /E2E_DYNAMO_ENDPOINT.*port 8000/,
      );
    },
  );

  it('rejects a value that is not a URL', () => {
    expect(() => resolveE2eDynamoEndpoint({ E2E_DYNAMO_ENDPOINT: 'localhost-8001' })).toThrow(
      /E2E_DYNAMO_ENDPOINT/,
    );
  });
});
