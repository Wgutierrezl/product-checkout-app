import { getEnv, isSandboxPublicKey } from './env';

const FIXTURES = {
  VITE_API_URL: 'https://api.checkout.test',
  VITE_PAYMENT_GATEWAY_URL: 'https://gateway.checkout.test',
  VITE_PAYMENT_GATEWAY_PUBLIC_KEY: 'pub_test_0000000000',
};

describe('getEnv', () => {
  afterEach(() => {
    process.env.VITE_API_URL = FIXTURES.VITE_API_URL;
    process.env.VITE_PAYMENT_GATEWAY_URL = FIXTURES.VITE_PAYMENT_GATEWAY_URL;
    process.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY =
      FIXTURES.VITE_PAYMENT_GATEWAY_PUBLIC_KEY;
  });

  it('reads VITE_API_URL from the environment', () => {
    expect(getEnv().apiUrl).toBe('https://api.checkout.test');
  });

  it('reads VITE_PAYMENT_GATEWAY_URL from the environment', () => {
    expect(getEnv().paymentGatewayUrl).toBe('https://gateway.checkout.test');
  });

  it('reads VITE_PAYMENT_GATEWAY_PUBLIC_KEY from the environment', () => {
    expect(getEnv().paymentGatewayPublicKey).toBe('pub_test_0000000000');
  });

  it('throws a descriptive error when a required variable is undefined', () => {
    delete process.env.VITE_API_URL;

    expect(() => getEnv()).toThrow(/VITE_API_URL/);
  });

  it('throws a descriptive error when a required variable is an empty string', () => {
    process.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY = '';

    expect(() => getEnv()).toThrow(/VITE_PAYMENT_GATEWAY_PUBLIC_KEY/);
  });

  it('lists every missing variable in a single error when more than one is missing', () => {
    delete process.env.VITE_API_URL;
    delete process.env.VITE_PAYMENT_GATEWAY_URL;

    expect(() => getEnv()).toThrow(
      /VITE_API_URL.*VITE_PAYMENT_GATEWAY_URL/s,
    );
  });

  it('marks the environment as sandbox when the public key is a test key', () => {
    process.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY = 'pub_test_0000000000';

    expect(getEnv().isSandbox).toBe(true);
  });

  it('marks the environment as non-sandbox when the public key is a production key', () => {
    process.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY = 'pub_prod_0000000000';

    expect(getEnv().isSandbox).toBe(false);
  });
});

describe('isSandboxPublicKey', () => {
  it('returns true for a pub_test_ prefixed key', () => {
    expect(isSandboxPublicKey('pub_test_0000000000')).toBe(true);
  });

  it('returns true for a pub_stagtest_ prefixed key', () => {
    expect(isSandboxPublicKey('pub_stagtest_0000000000')).toBe(true);
  });

  it('returns false for a pub_prod_ prefixed key', () => {
    expect(isSandboxPublicKey('pub_prod_0000000000')).toBe(false);
  });

  it('returns false for an unrecognized key prefix', () => {
    expect(isSandboxPublicKey('unknown_0000000000')).toBe(false);
  });
});
