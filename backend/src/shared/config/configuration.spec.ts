import configuration from './configuration';

const ENV_KEYS = [
  'NODE_ENV',
  'PORT',
  'PAYMENT_GATEWAY_URL',
  'PAYMENT_GATEWAY_PUBLIC_KEY',
  'PAYMENT_GATEWAY_PRIVATE_KEY',
  'PAYMENT_GATEWAY_INTEGRITY_SECRET',
  'PAYMENT_GATEWAY_EVENTS_SECRET',
  'CORS_ALLOWED_ORIGINS',
  'AWS_REGION',
  'DYNAMO_ENDPOINT',
  'BASE_FEE_CENTS',
  'DELIVERY_FEE_CENTS',
  'LAZY_POLL_THRESHOLD_MS',
  'THROTTLE_TTL',
  'THROTTLE_LIMIT',
] as const;

describe('configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('maps required env vars and applies defaults for optional ones', () => {
    process.env.PAYMENT_GATEWAY_URL = 'https://sandbox.payment-gateway.test';
    process.env.PAYMENT_GATEWAY_PUBLIC_KEY = 'pub_123';
    process.env.PAYMENT_GATEWAY_PRIVATE_KEY = 'prv_123';
    process.env.PAYMENT_GATEWAY_INTEGRITY_SECRET = 'integrity_123';
    process.env.PAYMENT_GATEWAY_EVENTS_SECRET = 'events_123';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173, http://localhost:3001';

    const config = configuration();

    expect(config.paymentGateway.url).toBe('https://sandbox.payment-gateway.test');
    expect(config.fees.baseFeeCents).toBe(250_000);
    expect(config.fees.deliveryFeeCents).toBe(800_000);
    expect(config.cors.allowedOrigins).toEqual([
      'http://localhost:5173',
      'http://localhost:3001',
    ]);
  });

  it('parses numeric overrides from the environment', () => {
    process.env.PAYMENT_GATEWAY_URL = 'https://sandbox.payment-gateway.test';
    process.env.PAYMENT_GATEWAY_PUBLIC_KEY = 'pub_123';
    process.env.PAYMENT_GATEWAY_PRIVATE_KEY = 'prv_123';
    process.env.PAYMENT_GATEWAY_INTEGRITY_SECRET = 'integrity_123';
    process.env.PAYMENT_GATEWAY_EVENTS_SECRET = 'events_123';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173';
    process.env.BASE_FEE_CENTS = '111';
    process.env.LAZY_POLL_THRESHOLD_MS = '5000';

    const config = configuration();

    expect(config.fees.baseFeeCents).toBe(111);
    expect(config.lazyPollThresholdMs).toBe(5000);
  });

  it('falls back to safe defaults when nothing is set in the environment', () => {
    delete process.env.NODE_ENV;

    const config = configuration();

    expect(config.nodeEnv).toBe('development');
    expect(config.paymentGateway).toEqual({
      url: '',
      publicKey: '',
      privateKey: '',
      integritySecret: '',
      eventsSecret: '',
    });
    expect(config.cors.allowedOrigins).toEqual([]);
  });
});
