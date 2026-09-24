import { GatewayTransactionStatus, GATEWAY_TRANSACTION_STATUSES } from './payment-gateway.types';
import { WebhookEventPayload } from './webhook-checksum';

export interface WebhookTransactionEvent {
  gatewayTransactionId: string;
  status: GatewayTransactionStatus;
  reference?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGatewayTransactionStatus(value: unknown): value is GatewayTransactionStatus {
  return typeof value === 'string' && (GATEWAY_TRANSACTION_STATUSES as readonly string[]).includes(value);
}

/**
 * Extracts the `{ gatewayTransactionId, status, reference }` triple a webhook
 * handler needs from `payload.data.transaction`, the shape this gateway's
 * `transaction.updated` event carries. Only called AFTER
 * `verifyWebhookChecksum` has already validated the payload's authenticity —
 * this function is purely a shape parser and never throws: any malformed or
 * unexpected shape (missing `transaction`, non-string id, unknown status)
 * yields `null` so the caller can respond 200 without side effects instead of
 * crashing on an untrusted-shape (but checksum-valid) payload.
 */
export function parseWebhookTransactionEvent(payload: WebhookEventPayload): WebhookTransactionEvent | null {
  if (!isRecord(payload?.data)) {
    return null;
  }

  const transaction = payload.data.transaction;
  if (!isRecord(transaction)) {
    return null;
  }

  const { id, status, reference } = transaction;
  if (typeof id !== 'string' || !isGatewayTransactionStatus(status)) {
    return null;
  }

  return { gatewayTransactionId: id, status, reference: typeof reference === 'string' ? reference : undefined };
}
