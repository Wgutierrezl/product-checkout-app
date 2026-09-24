import { getEnv } from './env';

describe('getEnv', () => {
  it('reads VITE_API_URL from import.meta.env', () => {
    expect(getEnv().apiUrl).toBe(import.meta.env.VITE_API_URL);
  });

  it('reads VITE_PAYMENT_GATEWAY_URL from import.meta.env', () => {
    expect(getEnv().paymentGatewayUrl).toBe(
      import.meta.env.VITE_PAYMENT_GATEWAY_URL,
    );
  });

  it('reads VITE_PAYMENT_GATEWAY_PUBLIC_KEY from import.meta.env', () => {
    expect(getEnv().paymentGatewayPublicKey).toBe(
      import.meta.env.VITE_PAYMENT_GATEWAY_PUBLIC_KEY,
    );
  });
});
