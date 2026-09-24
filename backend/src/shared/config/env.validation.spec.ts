import { validateEnv } from './env.validation';

const requiredEnv = {
  PAYMENT_GATEWAY_URL: 'https://sandbox.payment-gateway.test',
  PAYMENT_GATEWAY_PUBLIC_KEY: 'pub_test_123',
  PAYMENT_GATEWAY_PRIVATE_KEY: 'prv_test_123',
  PAYMENT_GATEWAY_INTEGRITY_SECRET: 'integrity_secret_123',
  PAYMENT_GATEWAY_EVENTS_SECRET: 'events_secret_123',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
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
});
