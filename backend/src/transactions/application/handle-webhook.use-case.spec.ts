import { createHash } from 'node:crypto';

import { PaymentGatewayError, ValidationError } from '../../shared/errors/domain-error';
import { ClockPort } from '../../shared/ports/clock.port';
import { IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { GatewayTransactionResult } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { WebhookEventPayload } from '../../shared/payment-gateway/domain/webhook-checksum';
import { buildTransaction, FakeTransactionRepository } from '../test/transaction.fixtures';
import { HandleWebhookUseCase } from './handle-webhook.use-case';
import { SettleTransactionUseCase } from './settle-transaction.use-case';

class StubGatewayPort implements PaymentGatewayPort {
  public getTransactionCallCount = 0;

  constructor(
    private readonly result: { ok: true; value: GatewayTransactionResult } | { ok: false; error: PaymentGatewayError } = {
      ok: true,
      value: { gatewayTransactionId: 'gw-fallback', status: 'APPROVED' },
    },
  ) {}

  getAcceptanceTokens(): never {
    throw new Error('not used in this suite');
  }

  createCardTransaction(): never {
    throw new Error('not used in this suite');
  }

  getTransaction(): AppResultAsync<GatewayTransactionResult> {
    this.getTransactionCallCount += 1;
    return this.result.ok ? okAsync(this.result.value) : errAsync(this.result.error);
  }

  getTransactionByReference(): never {
    throw new Error('not used in this suite');
  }
}

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

function buildUseCase(transactions: FakeTransactionRepository, gateway: PaymentGatewayPort = new StubGatewayPort()) {
  const clock = buildFakeClock('2026-09-24T00:00:00.000Z');
  const settleTransaction = new SettleTransactionUseCase(transactions, new FixedIdGenerator(), clock);
  return new HandleWebhookUseCase(transactions, settleTransaction, gateway, EVENTS_SECRET);
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

  describe('amount/currency integrity check', () => {
    function signedPayloadWithAmount(transaction: Record<string, unknown>) {
      const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents', 'transaction.currency'];
      const timestamp = 1_700_000_000;
      const values = [transaction.id, transaction.status, transaction.amount_in_cents, transaction.currency].map(String);
      const checksum = createHash('sha256').update(`${values.join('')}${timestamp}${EVENTS_SECRET}`).digest('hex');
      return {
        event: 'transaction.updated',
        environment: 'test',
        data: { transaction },
        signature: { properties, checksum },
        timestamp,
        sent_at: '2023-11-14T22:13:20.000Z',
      };
    }

    it('settles when the event amount/currency match the stored transaction', async () => {
      const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' }); // totalAmount = 1_350_000
      const transactions = new FakeTransactionRepository([tx]);
      const payload = signedPayloadWithAmount({ id: 'gw-1', status: 'APPROVED', amount_in_cents: 1_350_000, currency: 'COP' });
      const useCase = buildUseCase(transactions);

      const result = await useCase.execute(payload);

      expect(result.isOk()).toBe(true);
      const found = await transactions.findById('tx-1');
      expect(found._unsafeUnwrap().status).toBe('APPROVED');
    });

    it('does NOT settle when the event amount does not match the stored total, and logs an error', async () => {
      const tx = buildTransaction({ id: 'tx-1', reference: 'REF-tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' });
      const transactions = new FakeTransactionRepository([tx]);
      const payload = signedPayloadWithAmount({ id: 'gw-1', status: 'APPROVED', amount_in_cents: 999_999, currency: 'COP' });
      const errorSpy = jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation();
      const useCase = buildUseCase(transactions);

      const result = await useCase.execute(payload);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
      const found = await transactions.findById('tx-1');
      expect(found._unsafeUnwrap().status).toBe('PENDING');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('tx-1'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('REF-tx-1'));
      errorSpy.mockRestore();
    });

    it('does NOT settle when the event currency does not match', async () => {
      const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' });
      const transactions = new FakeTransactionRepository([tx]);
      const payload = signedPayloadWithAmount({ id: 'gw-1', status: 'APPROVED', amount_in_cents: 1_350_000, currency: 'USD' });
      jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation();
      const useCase = buildUseCase(transactions);

      const result = await useCase.execute(payload);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
      const found = await transactions.findById('tx-1');
      expect(found._unsafeUnwrap().status).toBe('PENDING');
    });

    it('settles when the event carries no amount/currency at all (nothing to verify)', async () => {
      const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' });
      const transactions = new FakeTransactionRepository([tx]);
      const payload = signedPayload({ id: 'gw-1', status: 'APPROVED' });
      const useCase = buildUseCase(transactions);

      const result = await useCase.execute(payload);

      expect(result.isOk()).toBe(true);
      const found = await transactions.findById('tx-1');
      expect(found._unsafeUnwrap().status).toBe('APPROVED');
    });

    describe('unsigned amount/currency (not covered by signature.properties) — trust boundary', () => {
      /** amount_in_cents/currency are present in the event but deliberately NOT listed in signature.properties. */
      function signedPayloadUnsignedAmount(transaction: Record<string, unknown>) {
        const properties = ['transaction.id', 'transaction.status']; // amount/currency intentionally excluded
        const timestamp = 1_700_000_000;
        const values = properties.map((path) => String((transaction as Record<string, unknown>)[path.split('.')[1]]));
        const checksum = createHash('sha256').update(`${values.join('')}${timestamp}${EVENTS_SECRET}`).digest('hex');
        return {
          event: 'transaction.updated',
          environment: 'test',
          data: { transaction },
          signature: { properties, checksum },
          timestamp,
          sent_at: '2023-11-14T22:13:20.000Z',
        };
      }

      it('does NOT trust an unsigned amount from the payload — fetches it from the gateway by id instead, and settles when it matches', async () => {
        const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' }); // totalAmount = 1_350_000
        const transactions = new FakeTransactionRepository([tx]);
        // Payload amount is tampered (999) but NOT signed — must be ignored.
        const payload = signedPayloadUnsignedAmount({ id: 'gw-1', status: 'APPROVED', amount_in_cents: 999, currency: 'COP' });
        const gateway = new StubGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED', amountInCents: 1_350_000, currency: 'COP' } });
        const useCase = buildUseCase(transactions, gateway);

        const result = await useCase.execute(payload);

        expect(result.isOk()).toBe(true);
        expect(gateway.getTransactionCallCount).toBe(1);
        const found = await transactions.findById('tx-1');
        expect(found._unsafeUnwrap().status).toBe('APPROVED');
      });

      it('refuses to settle when the gateway-fetched (authoritative) amount does not match the stored total', async () => {
        const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' });
        const payload = signedPayloadUnsignedAmount({ id: 'gw-1', status: 'APPROVED', amount_in_cents: 1_350_000, currency: 'COP' });
        const transactions = new FakeTransactionRepository([tx]);
        const gateway = new StubGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED', amountInCents: 1, currency: 'COP' } });
        jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation();
        const useCase = buildUseCase(transactions, gateway);

        const result = await useCase.execute(payload);

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBeNull();
        const found = await transactions.findById('tx-1');
        expect(found._unsafeUnwrap().status).toBe('PENDING');
      });

      it('only fetches the fallback for the field that is unsigned, trusting the other signed field as-is', async () => {
        // amount_in_cents IS signed; currency is NOT — only currency should come from the gateway fallback.
        const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
        const timestamp = 1_700_000_000;
        const transactionData = { id: 'gw-1', status: 'APPROVED', amount_in_cents: 1_350_000, currency: 'USD' };
        const values = [transactionData.id, transactionData.status, String(transactionData.amount_in_cents)];
        const checksum = createHash('sha256').update(`${values.join('')}${timestamp}${EVENTS_SECRET}`).digest('hex');
        const payload = {
          event: 'transaction.updated',
          environment: 'test',
          data: { transaction: transactionData },
          signature: { properties, checksum },
          timestamp,
          sent_at: '2023-11-14T22:13:20.000Z',
        };
        const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' }); // totalAmount = 1_350_000
        const transactions = new FakeTransactionRepository([tx]);
        // Gateway fallback reports a DIFFERENT amount — must be ignored since amount was signed and trusted directly.
        const gateway = new StubGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED', amountInCents: 1, currency: 'COP' } });
        const useCase = buildUseCase(transactions, gateway);

        const result = await useCase.execute(payload);

        expect(result.isOk()).toBe(true);
        const found = await transactions.findById('tx-1');
        expect(found._unsafeUnwrap().status).toBe('APPROVED');
      });

      it('only fetches the fallback for amount when currency is signed and amount is not', async () => {
        // currency IS signed; amount_in_cents is NOT — only amount should come from the gateway fallback.
        const properties = ['transaction.id', 'transaction.status', 'transaction.currency'];
        const timestamp = 1_700_000_000;
        const transactionData = { id: 'gw-1', status: 'APPROVED', amount_in_cents: 1, currency: 'COP' };
        const values = [transactionData.id, transactionData.status, transactionData.currency];
        const checksum = createHash('sha256').update(`${values.join('')}${timestamp}${EVENTS_SECRET}`).digest('hex');
        const payload = {
          event: 'transaction.updated',
          environment: 'test',
          data: { transaction: transactionData },
          signature: { properties, checksum },
          timestamp,
          sent_at: '2023-11-14T22:13:20.000Z',
        };
        const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' }); // totalAmount = 1_350_000
        const transactions = new FakeTransactionRepository([tx]);
        // Gateway fallback reports the REAL amount — must be used since the payload's amount is unsigned.
        const gateway = new StubGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED', amountInCents: 1_350_000, currency: 'USD' } });
        const useCase = buildUseCase(transactions, gateway);

        const result = await useCase.execute(payload);

        expect(result.isOk()).toBe(true);
        const found = await transactions.findById('tx-1');
        expect(found._unsafeUnwrap().status).toBe('APPROVED');
      });

      it('fails closed (refuses to settle) when the gateway fallback call itself fails', async () => {
        const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' });
        const payload = signedPayloadUnsignedAmount({ id: 'gw-1', status: 'APPROVED', amount_in_cents: 1_350_000, currency: 'COP' });
        const transactions = new FakeTransactionRepository([tx]);
        const gateway = new StubGatewayPort({ ok: false, error: new PaymentGatewayError('timeout', true) });
        jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation();
        const useCase = buildUseCase(transactions, gateway);

        const result = await useCase.execute(payload);

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBeNull();
        const found = await transactions.findById('tx-1');
        expect(found._unsafeUnwrap().status).toBe('PENDING');
      });
    });
  });
});
