import { validateEnv } from './env.validation';

const requiredEnv = {
  PAYMENT_GATEWAY_URL: 'https://sandbox.payment-gateway.test',
  PAYMENT_GATEWAY_PUBLIC_KEY: 'pub_test_123',
  PAYMENT_GATEWAY_PRIVATE_KEY: 'prv_test_123',
  PAYMENT_GATEWAY_INTEGRITY_SECRET: 'integrity_secret_123',
  PAYMENT_GATEWAY_EVENTS_SECRET: 'events_secret_123',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  ACCOUNTS_JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long',
};

describe('validateEnv', () => {
  it('throws when a required variable is missing', () => {
    expect(() => validateEnv({})).toThrow();
  });

  it('throws listing which required variable is missing', () => {
    const { PAYMENT_GATEWAY_URL: _omit, ...incomplete } = requiredEnv;
    expect(() => validateEnv(incomplete)).toThrow(/PAYMENT_GATEWAY_URL/);
  });

  it('returns validated config with defaults applied when required vars are present', () => {
    const result = validateEnv(requiredEnv);

    expect(result.PAYMENT_GATEWAY_URL).toBe(requiredEnv.PAYMENT_GATEWAY_URL);
    expect(result.PORT).toBe(3000);
    expect(result.BASE_FEE_CENTS).toBe(250_000);
    expect(result.DELIVERY_FEE_CENTS).toBe(800_000);
    expect(result.LAZY_POLL_THRESHOLD_MS).toBe(3000);
  });

  it('applies explicit override values instead of defaults', () => {
    const result = validateEnv({
      ...requiredEnv,
      PORT: '4000',
      BASE_FEE_CENTS: '999',
    });

    expect(result.PORT).toBe(4000);
    expect(result.BASE_FEE_CENTS).toBe(999);
  });

  it.each([
    'PAYMENT_GATEWAY_URL',
    'PAYMENT_GATEWAY_PUBLIC_KEY',
    'PAYMENT_GATEWAY_PRIVATE_KEY',
    'PAYMENT_GATEWAY_INTEGRITY_SECRET',
    'PAYMENT_GATEWAY_EVENTS_SECRET',
    'CORS_ALLOWED_ORIGINS',
    'ACCOUNTS_JWT_SECRET',
  ] as const)('rejects an empty string for required var %s', (key) => {
    expect(() => validateEnv({ ...requiredEnv, [key]: '' })).toThrow();
  });

  it('rejects a PAYMENT_GATEWAY_URL that is not a valid URL', () => {
    expect(() =>
      validateEnv({ ...requiredEnv, PAYMENT_GATEWAY_URL: 'not a valid url' }),
    ).toThrow();
  });

  it('accepts a PAYMENT_GATEWAY_URL without a TLD (local/sandbox hosts)', () => {
    const result = validateEnv({ ...requiredEnv, PAYMENT_GATEWAY_URL: 'http://localhost:4000' });

    expect(result.PAYMENT_GATEWAY_URL).toBe('http://localhost:4000');
  });

  it.each(['0', '-1', '70000'])('rejects an out-of-range PORT value %s', (port) => {
    expect(() => validateEnv({ ...requiredEnv, PORT: port })).toThrow();
  });

  it.each(['1', '65535'])('accepts a boundary-valid PORT value %s', (port) => {
    const result = validateEnv({ ...requiredEnv, PORT: port });

    expect(result.PORT).toBe(Number(port));
  });

  it('defaults PAYMENT_GATEWAY_TIMEOUT_MS to 8000ms', () => {
    const result = validateEnv(requiredEnv);

    expect(result.PAYMENT_GATEWAY_TIMEOUT_MS).toBe(8000);
  });

  it('applies an explicit PAYMENT_GATEWAY_TIMEOUT_MS override', () => {
    const result = validateEnv({ ...requiredEnv, PAYMENT_GATEWAY_TIMEOUT_MS: '5000' });

    expect(result.PAYMENT_GATEWAY_TIMEOUT_MS).toBe(5000);
  });

  it('rejects a non-positive PAYMENT_GATEWAY_TIMEOUT_MS', () => {
    expect(() => validateEnv({ ...requiredEnv, PAYMENT_GATEWAY_TIMEOUT_MS: '0' })).toThrow();
  });

  it('defaults THROTTLE_LIMIT to 30 requests per window', () => {
    const result = validateEnv(requiredEnv);

    expect(result.THROTTLE_LIMIT).toBe(30);
  });

  it('applies an explicit THROTTLE_LIMIT override', () => {
    const result = validateEnv({ ...requiredEnv, THROTTLE_LIMIT: '5' });

    expect(result.THROTTLE_LIMIT).toBe(5);
  });
});
