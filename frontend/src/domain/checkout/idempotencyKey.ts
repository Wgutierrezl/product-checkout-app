/**
 * Generates a UUIDv4 to use as an idempotency key for one checkout
 * attempt. Relies on the platform's `crypto.randomUUID` (available
 * in browsers and Node 19+/jsdom test environments).
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
