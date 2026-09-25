import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';

import { loadSecretsFromSsm } from './ssm-bootstrap';

describe('loadSecretsFromSsm', () => {
  const ssmMock = mockClient(SSMClient);
  const originalEnv = { ...process.env };

  beforeEach(() => {
    ssmMock.reset();
    process.env = { ...originalEnv };
    delete process.env.SSM_PARAM_PREFIX;
    delete process.env.PAYMENT_GATEWAY_PRIVATE_KEY;
    delete process.env.PAYMENT_GATEWAY_INTEGRITY_SECRET;
    delete process.env.PAYMENT_GATEWAY_EVENTS_SECRET;
    delete process.env.ACCOUNTS_JWT_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does nothing when SSM_PARAM_PREFIX is unset (local/dev)', async () => {
    await loadSecretsFromSsm();

    expect(ssmMock.commandCalls(GetParametersCommand)).toHaveLength(0);
    expect(process.env.PAYMENT_GATEWAY_PRIVATE_KEY).toBeUndefined();
  });

  it('fetches and populates the 3 gateway secrets plus the accounts JWT secret when the prefix is set', async () => {
    process.env.SSM_PARAM_PREFIX = '/checkout/gateway';
    ssmMock.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: '/checkout/gateway/private-key', Value: 'private-key-value' },
        { Name: '/checkout/gateway/integrity-secret', Value: 'integrity-secret-value' },
        { Name: '/checkout/gateway/events-secret', Value: 'events-secret-value' },
        { Name: '/checkout/gateway/jwt-secret', Value: 'jwt-secret-value' },
      ],
      InvalidParameters: [],
    });

    await loadSecretsFromSsm();

    const call = ssmMock.commandCalls(GetParametersCommand)[0].args[0].input;
    expect(call).toEqual({
      Names: [
        '/checkout/gateway/private-key',
        '/checkout/gateway/integrity-secret',
        '/checkout/gateway/events-secret',
        '/checkout/gateway/jwt-secret',
      ],
      WithDecryption: true,
    });
    expect(process.env.PAYMENT_GATEWAY_PRIVATE_KEY).toBe('private-key-value');
    expect(process.env.PAYMENT_GATEWAY_INTEGRITY_SECRET).toBe('integrity-secret-value');
    expect(process.env.PAYMENT_GATEWAY_EVENTS_SECRET).toBe('events-secret-value');
    expect(process.env.ACCOUNTS_JWT_SECRET).toBe('jwt-secret-value');
  });

  it('throws fast when any parameter is missing or inaccessible', async () => {
    process.env.SSM_PARAM_PREFIX = '/checkout/gateway';
    ssmMock.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: '/checkout/gateway/private-key', Value: 'private-key-value' },
      ],
      InvalidParameters: ['/checkout/gateway/integrity-secret', '/checkout/gateway/events-secret'],
    });

    await expect(loadSecretsFromSsm()).rejects.toThrow(
      'Missing SSM parameters: /checkout/gateway/integrity-secret, /checkout/gateway/events-secret',
    );
    expect(process.env.PAYMENT_GATEWAY_PRIVATE_KEY).toBeUndefined();
  });
});
