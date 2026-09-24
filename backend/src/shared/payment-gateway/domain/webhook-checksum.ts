import { createHash, timingSafeEqual } from 'node:crypto';

export interface WebhookSignature {
  properties: string[];
  checksum: string;
}

export interface WebhookEventPayload {
  event: string;
  data: Record<string, unknown>;
  environment: string;
  signature: WebhookSignature;
  timestamp: number;
  sent_at: string;
}

/**
 * Resolves a dot-separated path (e.g. `"transaction.id"`) against a plain
 * object, returning `undefined` if any segment is missing. Never throws —
 * an unresolved path just yields a checksum mismatch, which is the correct
 * "reject" behavior for a malformed/tampered payload.
 */
function resolvePropertyPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value !== null && typeof value === 'object' && key in (value as Record<string, unknown>)) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

/**
 * Verifies a payment gateway webhook checksum: SHA256 hex digest of the
 * concatenated values of `signature.properties` (read dynamically — the
 * property list varies per event type and must never be hardcoded), read
 * from `data` in the listed order, followed by `timestamp` and the events
 * secret. Comparison is constant-time to avoid leaking checksum bytes via
 * response-time side channels.
 */
export function verifyWebhookChecksum(
  payload: WebhookEventPayload,
  eventsSecret: string,
): boolean {
  const values = payload.signature.properties.map((path) =>
    String(resolvePropertyPath(payload.data, path)),
  );
  const concatenated = `${values.join('')}${payload.timestamp}${eventsSecret}`;
  const computed = createHash('sha256').update(concatenated).digest('hex');

  const computedBuffer = Buffer.from(computed, 'hex');
  const receivedBuffer = Buffer.from(payload.signature.checksum, 'hex');

  if (computedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedBuffer, receivedBuffer);
}
