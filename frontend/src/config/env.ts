export interface AppEnv {
  apiUrl: string;
  paymentGatewayUrl: string;
  paymentGatewayPublicKey: string;
}

const REQUIRED_KEYS = [
  'VITE_API_URL',
  'VITE_PAYMENT_GATEWAY_URL',
  'VITE_PAYMENT_GATEWAY_PUBLIC_KEY',
] as const;

type RequiredKey = (typeof REQUIRED_KEYS)[number];

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
  };
}
