import { createHash } from 'node:crypto';

import { ValidationError } from '../../shared/errors/domain-error';
import { ClockPort } from '../../shared/ports/clock.port';
import { IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { WebhookEventPayload } from '../../shared/payment-gateway/domain/webhook-checksum';
import { buildTransaction, FakeTransactionRepository } from '../test/transaction.fixtures';
import { HandleWebhookUseCase } from './handle-webhook.use-case';
import { SettleTransactionUseCase } from './settle-transaction.use-case';

const EVENTS_SECRET = 'test_events_secret';

function buildFakeClock(iso: string): ClockPort {
  return { now: () => new Date(iso) };
}

class FixedIdGenerator implements IdGeneratorPort {
  newId(): string {
    return 'delivery-generated-1';
  }
  newReference(): string {
    throw new Error('not used in this suite');
  }
}

function signedPayload(
  transaction: Record<string, unknown>,
  overrides: Partial<WebhookEventPayload> = {},
): WebhookEventPayload {
  const properties = ['transaction.id', 'transaction.status'];
  const timestamp = 1_700_000_000;
  const values = properties.map((path) => String((transaction as Record<string, unknown>)[path.split('.')[1]]));
  const checksum = createHash('sha256')
    .update(`${values.join('')}${timestamp}${EVENTS_SECRET}`)
    .digest('hex');

  return {
    event: 'transaction.updated',
    environment: 'test',
    data: { transaction },
    signature: { properties, checksum },
    timestamp,
    sent_at: '2023-11-14T22:13:20.000Z',
    ...overrides,
  };
}

function buildUseCase(transactions: FakeTransactionRepository) {
  const clock = buildFakeClock('2026-09-24T00:00:00.000Z');
  const settleTransaction = new SettleTransactionUseCase(transactions, new FixedIdGenerator(), clock);
  return new HandleWebhookUseCase(transactions, settleTransaction, EVENTS_SECRET);
}

describe('HandleWebhookUseCase', () => {
  it('rejects a payload with an invalid checksum', async () => {
    const payload = signedPayload({ id: 'gw-1', status: 'APPROVED' }, { signature: { properties: ['transaction.id'], checksum: 'tampered' } });
    const transactions = new FakeTransactionRepository([]);
    const useCase = buildUseCase(transactions);

    const result = await useCase.execute(payload);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(ValidationError);
  });

  it('settles the matching transaction found by gatewayTransactionId (GatewayTxIndex)', async () => {
    const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' });
    const transactions = new FakeTransactionRepository([tx]);
    const payload = signedPayload({ id: 'gw-1', status: 'APPROVED' });
    const useCase = buildUseCase(transactions);

    const result = await useCase.execute(payload);

    expect(result.isOk()).toBe(true);
    const found = await transactions.findById('tx-1');
    expect(found._unsafeUnwrap().status).toBe('APPROVED');
  });

  it('falls back to looking up by reference when gatewayTransactionId is not yet known', async () => {
    const tx = buildTransaction({ id: 'tx-1', reference: 'REF-tx-1', status: 'PENDING', gatewayTransactionId: undefined });
    const transactions = new FakeTransactionRepository([tx]);
    const payload = signedPayload({ id: 'gw-new', status: 'APPROVED', reference: 'REF-tx-1' }, {
      signature: { properties: ['transaction.id', 'transaction.status', 'transaction.reference'], checksum: '' },
    });
    // Recompute checksum for the 3-property signature used in this test only.
    const values = ['gw-new', 'APPROVED', 'REF-tx-1'];
    const checksum = createHash('sha256').update(`${values.join('')}${payload.timestamp}${EVENTS_SECRET}`).digest('hex');
    payload.signature.checksum = checksum;

    const useCase = buildUseCase(transactions);
    const result = await useCase.execute(payload);

    expect(result.isOk()).toBe(true);
    const found = await transactions.findById('tx-1');
    expect(found._unsafeUnwrap().status).toBe('APPROVED');
    expect(found._unsafeUnwrap().gatewayTransactionId).toBe('gw-new');
  });

  it('is idempotent (responds ok, no-op) for a valid checksum on an unknown transaction', async () => {
    const transactions = new FakeTransactionRepository([]);
    const payload = signedPayload({ id: 'unknown-gw', status: 'APPROVED' });
    const useCase = buildUseCase(transactions);

    const result = await useCase.execute(payload);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeNull();
  });

  it('is idempotent (responds ok, no-op) for a checksum-valid but unparseable transaction shape', async () => {
    const transactions = new FakeTransactionRepository([]);
    const payload = signedPayload({});
    const useCase = buildUseCase(transactions);

    const result = await useCase.execute(payload);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeNull();
  });

  it('never double-applies settlement side effects when the transaction is already final (idempotent replay)', async () => {
    const tx = buildTransaction({ id: 'tx-1', status: 'APPROVED', gatewayTransactionId: 'gw-1' });
    const transactions = new FakeTransactionRepository([tx]);
    const payload = signedPayload({ id: 'gw-1', status: 'APPROVED' });
    const useCase = buildUseCase(transactions);

    const result = await useCase.execute(payload);

    expect(result.isOk()).toBe(true);
    expect(transactions.settleApprovedCalls).toHaveLength(0);
  });

  it('finalizes a DECLINED webhook event with no stock/delivery side effects', async () => {
    const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' });
    const transactions = new FakeTransactionRepository([tx]);
    const payload = signedPayload({ id: 'gw-1', status: 'DECLINED' });
    const useCase = buildUseCase(transactions);

    const result = await useCase.execute(payload);

    expect(result.isOk()).toBe(true);
    const found = await transactions.findById('tx-1');
    expect(found._unsafeUnwrap().status).toBe('DECLINED');
    expect(transactions.settleApprovedCalls).toHaveLength(0);
  });
});
