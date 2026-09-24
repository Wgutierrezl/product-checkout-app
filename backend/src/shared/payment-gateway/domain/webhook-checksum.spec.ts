import { createHash } from 'node:crypto';

import { verifyWebhookChecksum, WebhookEventPayload } from './webhook-checksum';

const EVENTS_SECRET = 'test_events_secret';

function buildPayload(overrides: Partial<WebhookEventPayload> = {}): WebhookEventPayload {
  return {
    event: 'transaction.updated',
    environment: 'test',
    data: {
      transaction: {
        id: 'txn_1',
        status: 'APPROVED',
        amount_in_cents: 1_000_000,
      },
    },
    signature: {
      properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
      checksum: 'e303adc5f336db4d3dc93f0d4364f6311cb2dd981d1764b918443f828eeb7e5b',
    },
    timestamp: 1_700_000_000,
    sent_at: '2023-11-14T22:13:20.000Z',
    ...overrides,
  };
}

describe('verifyWebhookChecksum', () => {
  it('returns true for a checksum matching a known SHA256 vector', () => {
    const payload = buildPayload();

    expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(true);
  });

  it('returns false when the checksum has been tampered with (same length, different bytes)', () => {
    const payload = buildPayload({
      signature: {
        properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
        checksum: '0'.repeat(64),
      },
    });

    expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
  });

  it('returns false when the received checksum has a different length than the computed one', () => {
    const payload = buildPayload({
      signature: {
        properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
        checksum: 'ab',
      },
    });

    expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
  });

  it('returns false when the events secret does not match', () => {
    const payload = buildPayload();

    expect(verifyWebhookChecksum(payload, 'wrong_secret')).toBe(false);
  });

  it('returns false when the underlying data value differs from what was signed', () => {
    const payload = buildPayload({
      data: {
        transaction: { id: 'txn_1', status: 'DECLINED', amount_in_cents: 1_000_000 },
      },
    });

    expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
  });

  it('returns false when a listed property path does not exist in data', () => {
    const payload = buildPayload({
      signature: {
        properties: ['transaction.id', 'transaction.does_not_exist'],
        checksum: 'e303adc5f336db4d3dc93f0d4364f6311cb2dd981d1764b918443f828eeb7e5b',
      },
    });

    expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
  });

  it('reads signature.properties dynamically instead of a hardcoded list', () => {
    const singlePropertyPayload = buildPayload({
      data: { transaction: { id: 'txn_only' } },
      signature: {
        properties: ['transaction.id'],
        checksum: '',
      },
      timestamp: 1_700_000_000,
    });
    const expectedChecksum = createHash('sha256')
      .update(`txn_only${singlePropertyPayload.timestamp}${EVENTS_SECRET}`)
      .digest('hex');

    const payload = { ...singlePropertyPayload, signature: { ...singlePropertyPayload.signature, checksum: expectedChecksum } };

    expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(true);
  });

  describe('malformed payloads (never throw, always reject)', () => {
    it('returns false when checksum is undefined', () => {
      const payload = buildPayload({
        signature: { properties: ['transaction.id'], checksum: undefined as unknown as string },
      });

      expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
    });

    it('returns false when checksum is null', () => {
      const payload = buildPayload({
        signature: { properties: ['transaction.id'], checksum: null as unknown as string },
      });

      expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
    });

    it('returns false when checksum is a number, not a string', () => {
      const payload = buildPayload({
        signature: { properties: ['transaction.id'], checksum: 123 as unknown as string },
      });

      expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
    });

    it('returns false when signature.properties is missing', () => {
      const payload = buildPayload({
        signature: { checksum: 'a'.repeat(64) } as unknown as WebhookEventPayload['signature'],
      });

      expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
    });

    it('returns false when signature.properties is not an array', () => {
      const payload = buildPayload({
        signature: {
          properties: 'transaction.id' as unknown as string[],
          checksum: 'a'.repeat(64),
        },
      });

      expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
    });

    it('returns false when signature is missing entirely', () => {
      const payload = { ...buildPayload(), signature: undefined } as unknown as WebhookEventPayload;

      expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
    });

    it('returns false when timestamp is missing', () => {
      const payload = { ...buildPayload(), timestamp: undefined } as unknown as WebhookEventPayload;

      expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
    });

    it('returns false when data is missing', () => {
      const payload = { ...buildPayload(), data: undefined } as unknown as WebhookEventPayload;

      expect(verifyWebhookChecksum(payload, EVENTS_SECRET)).toBe(false);
    });
  });
});
