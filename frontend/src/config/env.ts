export interface AppEnv {
  apiUrl: string;
  paymentGatewayUrl: string;
  paymentGatewayPublicKey: string;
  /** True when `paymentGatewayPublicKey` belongs to a sandbox/test environment. */
  isSandbox: boolean;
}

const REQUIRED_KEYS = [
  'VITE_API_URL',
  'VITE_PAYMENT_GATEWAY_URL',
  'VITE_PAYMENT_GATEWAY_PUBLIC_KEY',
] as const;

type RequiredKey = (typeof REQUIRED_KEYS)[number];

/** Public key prefixes issued for sandbox/test environments. */
const SANDBOX_PUBLIC_KEY_PREFIXES = ['pub_test_', 'pub_stagtest_'] as const;

/**
 * True when a payment gateway PUBLIC key belongs to a sandbox/test
 * environment rather than production. Test keys start with `pub_test_` or
 * `pub_stagtest_`; production keys start with `pub_prod_`. Pure and
 * prefix-only — it never needs the payment company's name or URLs to decide.
 */
export function isSandboxPublicKey(publicKey: string): boolean {
  return SANDBOX_PUBLIC_KEY_PREFIXES.some((prefix) => publicKey.startsWith(prefix));
}

/**
 * Single point of access to `import.meta.env`. Jest cannot parse
 * `import.meta` directly in every context, so all env reads in the
 * app MUST go through this module to keep mocking trivial in tests.
 *
 * Fails fast with a descriptive error if any required `VITE_*`
 * variable is missing or empty, instead of silently shipping
 * `undefined` into API clients.
 */
export function getEnv(): AppEnv {
  const raw: Record<RequiredKey, string> = {
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_PAYMENT_GATEWAY_URL: import.meta.env.VITE_PAYMENT_GATEWAY_URL,
    VITE_PAYMENT_GATEWAY_PUBLIC_KEY:
      import.meta.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY,
  };

  const missing = REQUIRED_KEYS.filter((key) => !raw[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }

  return {
    apiUrl: raw.VITE_API_URL,
    paymentGatewayUrl: raw.VITE_PAYMENT_GATEWAY_URL,
    paymentGatewayPublicKey: raw.VITE_PAYMENT_GATEWAY_PUBLIC_KEY,
    isSandbox: isSandboxPublicKey(raw.VITE_PAYMENT_GATEWAY_PUBLIC_KEY),
  };
}
