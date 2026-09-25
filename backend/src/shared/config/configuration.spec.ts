import { EnvironmentVariables, validateEnv } from './env.validation';
import configuration from './configuration';

const requiredEnv = {
  PAYMENT_GATEWAY_URL: 'https://sandbox.payment-gateway.test',
  PAYMENT_GATEWAY_PUBLIC_KEY: 'pub_123',
  PAYMENT_GATEWAY_PRIVATE_KEY: 'prv_123',
  PAYMENT_GATEWAY_INTEGRITY_SECRET: 'integrity_123',
  PAYMENT_GATEWAY_EVENTS_SECRET: 'events_123',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173, http://localhost:3001',
  ACCOUNTS_JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long',
};

function buildEnv(overrides: Record<string, unknown> = {}): EnvironmentVariables {
  return validateEnv({ ...requiredEnv, ...overrides });
}

describe('configuration', () => {
  it('maps every field of the validated EnvironmentVariables into the nested AppConfig shape', () => {
    const env = buildEnv();

    const config = configuration(env);

    expect(config).toEqual({
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      paymentGateway: {
        url: env.PAYMENT_GATEWAY_URL,
        publicKey: env.PAYMENT_GATEWAY_PUBLIC_KEY,
        privateKey: env.PAYMENT_GATEWAY_PRIVATE_KEY,
        integritySecret: env.PAYMENT_GATEWAY_INTEGRITY_SECRET,
        eventsSecret: env.PAYMENT_GATEWAY_EVENTS_SECRET,
        timeoutMs: env.PAYMENT_GATEWAY_TIMEOUT_MS,
      },
      aws: {
        region: env.AWS_REGION,
        dynamoEndpoint: env.DYNAMO_ENDPOINT,
      },
      fees: {
        baseFeeCents: env.BASE_FEE_CENTS,
        deliveryFeeCents: env.DELIVERY_FEE_CENTS,
      },
      lazyPollThresholdMs: env.LAZY_POLL_THRESHOLD_MS,
      reconciliationWindowMs: env.RECONCILIATION_WINDOW_MS,
      cors: {
        allowedOrigins: ['http://localhost:5173', 'http://localhost:3001'],
      },
      throttle: {
        ttl: env.THROTTLE_TTL,
        limit: env.THROTTLE_LIMIT,
      },
      accounts: {
        jwtSecret: env.ACCOUNTS_JWT_SECRET,
      },
    });
  });

  it('carries a RECONCILIATION_WINDOW_MS override straight through', () => {
    const env = buildEnv({ RECONCILIATION_WINDOW_MS: '120000' });

    const config = configuration(env);

    expect(config.reconciliationWindowMs).toBe(120_000);
  });

  it('splits, trims and drops empty entries from CORS_ALLOWED_ORIGINS', () => {
    const env = buildEnv({ CORS_ALLOWED_ORIGINS: 'http://a.test, http://b.test ,,' });

    const config = configuration(env);

    expect(config.cors.allowedOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it('carries numeric overrides straight through from the validated env (no re-defaulting)', () => {
    const env = buildEnv({ PORT: '4000', BASE_FEE_CENTS: '111', LAZY_POLL_THRESHOLD_MS: '5000' });

    const config = configuration(env);

    expect(config.port).toBe(4000);
    expect(config.fees.baseFeeCents).toBe(111);
    expect(config.lazyPollThresholdMs).toBe(5000);
  });

  it('carries a PAYMENT_GATEWAY_TIMEOUT_MS override straight through', () => {
    const env = buildEnv({ PAYMENT_GATEWAY_TIMEOUT_MS: '5000' });

    const config = configuration(env);

    expect(config.paymentGateway.timeoutMs).toBe(5000);
  });

  it('strips a single trailing slash from PAYMENT_GATEWAY_URL', () => {
    const env = buildEnv({ PAYMENT_GATEWAY_URL: 'https://sandbox.payment-gateway.test/' });

    const config = configuration(env);

    expect(config.paymentGateway.url).toBe('https://sandbox.payment-gateway.test');
  });

  it('strips multiple trailing slashes from PAYMENT_GATEWAY_URL', () => {
    const env = buildEnv({ PAYMENT_GATEWAY_URL: 'https://sandbox.payment-gateway.test///' });

    const config = configuration(env);

    expect(config.paymentGateway.url).toBe('https://sandbox.payment-gateway.test');
  });

  it('leaves a PAYMENT_GATEWAY_URL without a trailing slash unchanged', () => {
    const env = buildEnv({ PAYMENT_GATEWAY_URL: 'https://sandbox.payment-gateway.test/v1' });

    const config = configuration(env);

    expect(config.paymentGateway.url).toBe('https://sandbox.payment-gateway.test/v1');
  });

  it('defaults to validating process.env when called without an explicit EnvironmentVariables instance', () => {
    const originalEnv = { ...process.env };
    delete process.env.NODE_ENV;
    Object.assign(process.env, requiredEnv);

    const config = configuration();

    expect(config.paymentGateway.url).toBe(requiredEnv.PAYMENT_GATEWAY_URL);
    expect(config.nodeEnv).toBe('development');

    process.env = originalEnv;
  });
});
