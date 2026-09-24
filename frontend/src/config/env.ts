export interface AppEnv {
  apiUrl: string;
  paymentGatewayUrl: string;
  paymentGatewayPublicKey: string;
}

/**
 * Single point of access to `import.meta.env`. Jest cannot parse
 * `import.meta` directly in every context, so all env reads in the
 * app MUST go through this module to keep mocking trivial in tests.
 */
export function getEnv(): AppEnv {
  return {
    apiUrl: import.meta.env.VITE_API_URL,
    paymentGatewayUrl: import.meta.env.VITE_PAYMENT_GATEWAY_URL,
    paymentGatewayPublicKey: import.meta.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY,
  };
}
