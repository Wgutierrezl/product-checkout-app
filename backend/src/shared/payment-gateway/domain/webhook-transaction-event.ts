import { GatewayTransactionStatus, isGatewayTransactionStatus, isRecord } from './payment-gateway.types';
import { WebhookEventPayload } from './webhook-checksum';

export interface WebhookTransactionEvent {
  gatewayTransactionId: string;
  status: GatewayTransactionStatus;
  reference?: string;
  /** Present when the event carries an amount — used for the amount/currency integrity check (see `HandleWebhookUseCase`). */
  amountInCents?: number;
  currency?: string;
}

/**
 * Extracts the `{ gatewayTransactionId, status, reference, amountInCents,
 * currency }` a webhook handler needs from `payload.data.transaction`, the
 * shape this gateway's `transaction.updated` event carries. Only called
 * AFTER `verifyWebhookChecksum` has already validated the payload's
 * authenticity — this function is purely a shape parser and never throws:
 * any malformed or unexpected shape (missing `transaction`, non-string id,
 * unknown status) yields `null` so the caller can respond 200 without side
 * effects instead of crashing on an untrusted-shape (but checksum-valid)
 * payload. `amountInCents`/`currency` are optional on the resulting event —
 * a missing or wrong-typed value just leaves them `undefined` rather than
 * rejecting the whole event, since not every event type is guaranteed to
 * carry them.
 */
export function parseWebhookTransactionEvent(payload: WebhookEventPayload): WebhookTransactionEvent | null {
  if (!isRecord(payload?.data)) {
    return null;
  }

  const transaction = payload.data.transaction;
  if (!isRecord(transaction)) {
    return null;
  }

  const { id, status, reference, amount_in_cents: amountInCents, currency } = transaction;
  if (typeof id !== 'string' || !isGatewayTransactionStatus(status)) {
    return null;
  }

  return {
    gatewayTransactionId: id,
    status,
    reference: typeof reference === 'string' ? reference : undefined,
    amountInCents: typeof amountInCents === 'number' ? amountInCents : undefined,
    currency: typeof currency === 'string' ? currency : undefined,
  };
}
