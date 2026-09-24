import { parseWebhookTransactionEvent } from './webhook-transaction-event';
import { WebhookEventPayload } from './webhook-checksum';

function buildPayload(data: Record<string, unknown>): WebhookEventPayload {
  return {
    event: 'transaction.updated',
    environment: 'test',
    data,
    signature: { properties: ['transaction.id'], checksum: 'irrelevant-for-this-parser' },
    timestamp: 1_700_000_000,
    sent_at: '2023-11-14T22:13:20.000Z',
  };
}

describe('parseWebhookTransactionEvent', () => {
  it('extracts gatewayTransactionId, status, and reference from a well-formed payload', () => {
    const payload = buildPayload({
      transaction: { id: 'gw-tx-1', status: 'APPROVED', reference: 'REF-abc' },
    });

    const event = parseWebhookTransactionEvent(payload);

    expect(event).toEqual({ gatewayTransactionId: 'gw-tx-1', status: 'APPROVED', reference: 'REF-abc' });
  });

  it('extracts an event with no reference field as undefined reference', () => {
    const payload = buildPayload({ transaction: { id: 'gw-tx-2', status: 'DECLINED' } });

    const event = parseWebhookTransactionEvent(payload);

    expect(event).toEqual({ gatewayTransactionId: 'gw-tx-2', status: 'DECLINED', reference: undefined });
  });

  it('returns null when data.transaction is missing', () => {
    const payload = buildPayload({});

    expect(parseWebhookTransactionEvent(payload)).toBeNull();
  });

  it('returns null when transaction.id is not a string', () => {
    const payload = buildPayload({ transaction: { id: 123, status: 'APPROVED' } });

    expect(parseWebhookTransactionEvent(payload)).toBeNull();
  });

  it('returns null when transaction.status is not a known gateway status', () => {
    const payload = buildPayload({ transaction: { id: 'gw-tx-1', status: 'NOT_A_REAL_STATUS' } });

    expect(parseWebhookTransactionEvent(payload)).toBeNull();
  });

  it('returns null when data itself is malformed (never throws)', () => {
    const payload = { ...buildPayload({}), data: undefined } as unknown as WebhookEventPayload;

    expect(parseWebhookTransactionEvent(payload)).toBeNull();
  });
});
