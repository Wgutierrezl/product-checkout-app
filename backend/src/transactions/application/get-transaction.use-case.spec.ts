import { buildDelivery, FakeDeliveryRepository } from '../../deliveries/test/delivery.fixtures';
import { NotFoundError, PaymentGatewayError } from '../../shared/errors/domain-error';
import { ClockPort } from '../../shared/ports/clock.port';
import { IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { GatewayTransactionResult } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { buildTransaction, FakeTransactionRepository } from '../test/transaction.fixtures';
import { GetTransactionUseCase } from './get-transaction.use-case';
import { SettleTransactionUseCase } from './settle-transaction.use-case';

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

type GatewayOutcome =
  | { ok: true; value: GatewayTransactionResult }
  | { ok: false; error: PaymentGatewayError };

class RecordingGatewayPort implements PaymentGatewayPort {
  public getTransactionCallCount = 0;
  public getTransactionByReferenceCallCount = 0;

  constructor(
    private readonly result: GatewayOutcome,
    private readonly byReferenceResult: { ok: true; value: GatewayTransactionResult | null } | { ok: false; error: PaymentGatewayError } = {
      ok: true,
      value: null,
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

  getTransactionByReference(): AppResultAsync<GatewayTransactionResult | null> {
    this.getTransactionByReferenceCallCount += 1;
    return this.byReferenceResult.ok ? okAsync(this.byReferenceResult.value) : errAsync(this.byReferenceResult.error);
  }
}

const NOW_ISO = '2026-09-24T00:00:10.000Z'; // 10s after createdAt below
const LAZY_POLL_THRESHOLD_MS = 3000;
const RECONCILIATION_WINDOW_MS = 600_000; // 10 minutes

function buildUseCase(options: {
  transactions: FakeTransactionRepository;
  deliveries?: FakeDeliveryRepository;
  gateway: PaymentGatewayPort;
  clock?: ClockPort;
  reconciliationWindowMs?: number;
}) {
  const clock = options.clock ?? buildFakeClock(NOW_ISO);
  const settleTransaction = new SettleTransactionUseCase(options.transactions, new FixedIdGenerator(), clock);

  return new GetTransactionUseCase(
    options.transactions,
    options.deliveries ?? new FakeDeliveryRepository(),
    options.gateway,
    settleTransaction,
    clock,
    LAZY_POLL_THRESHOLD_MS,
    options.reconciliationWindowMs ?? RECONCILIATION_WINDOW_MS,
  );
}

describe('GetTransactionUseCase', () => {
  it('returns NotFoundError for an unknown id', async () => {
    const useCase = buildUseCase({ transactions: new FakeTransactionRepository([]), gateway: new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } }) });

    const result = await useCase.execute('missing-id');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  it('returns a non-stale PENDING transaction as-is, without polling the gateway', async () => {
    const tx = buildTransaction({
      id: 'tx-1',
      status: 'PENDING',
      gatewayTransactionId: 'gw-1',
      createdAt: '2026-09-24T00:00:09.000Z', // 1s ago, threshold is 3s
    });
    const transactions = new FakeTransactionRepository([tx]);
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
    const useCase = buildUseCase({ transactions, gateway });

    const result = await useCase.execute('tx-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().transaction.status).toBe('PENDING');
    expect(gateway.getTransactionCallCount).toBe(0);
  });

  it('does not poll a non-PENDING transaction even if stale', async () => {
    const tx = buildTransaction({ id: 'tx-1', status: 'DECLINED', createdAt: '2026-09-24T00:00:00.000Z' });
    const transactions = new FakeTransactionRepository([tx]);
    const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
    const useCase = buildUseCase({ transactions, gateway });

    const result = await useCase.execute('tx-1');

    expect(result.isOk()).toBe(true);
    expect(gateway.getTransactionCallCount).toBe(0);
  });

  describe('poll-by-reference (stale PENDING with no gatewayTransactionId yet — an ambiguous synchronous charge failure)', () => {
    function buildOrphanedTx(overrides: Partial<ReturnType<typeof buildTransaction>> = {}) {
      return buildTransaction({
        id: 'tx-1',
        reference: 'REF-tx-1',
        status: 'PENDING',
        gatewayTransactionId: undefined,
        createdAt: '2026-09-24T00:00:00.000Z', // 10s ago, threshold is 3s -> stale
        ...overrides,
      });
    }

    it('does not poll by id (no gatewayTransactionId to poll with)', async () => {
      const tx = buildOrphanedTx();
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const useCase = buildUseCase({ transactions, gateway });

      await useCase.execute('tx-1');

      expect(gateway.getTransactionCallCount).toBe(0);
    });

    it('settles the transaction when poll-by-reference finds a matching gateway transaction', async () => {
      const tx = buildOrphanedTx();
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort(
        { ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } },
        { ok: true, value: { gatewayTransactionId: 'gw-found', status: 'APPROVED' } },
      );
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('APPROVED');
      expect(result._unsafeUnwrap().transaction.gatewayTransactionId).toBe('gw-found');
      expect(gateway.getTransactionByReferenceCallCount).toBe(1);
    });

    it('stays PENDING (no error) when poll-by-reference finds nothing and the reconciliation window has not elapsed yet', async () => {
      const tx = buildOrphanedTx({ createdAt: '2026-09-24T00:00:05.000Z' }); // 5s ago, well under the 10-min window
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('PENDING');
    });

    it('marks the transaction ERROR once the reconciliation window has elapsed AND poll-by-reference confirms nothing exists', async () => {
      const tx = buildOrphanedTx({ createdAt: '2026-09-23T23:00:00.000Z' }); // ~1h ago, past the 10-min window
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('ERROR');
    });

    it('never fails the GET when poll-by-reference itself errors, and leaves the transaction PENDING', async () => {
      const tx = buildOrphanedTx({ createdAt: '2026-09-23T23:00:00.000Z' }); // past the window too, but the call fails
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort(
        { ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } },
        { ok: false, error: new PaymentGatewayError('network down', true) },
      );
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('PENDING');
    });

    it('always updates lastGatewayCheckAt after a poll-by-reference attempt', async () => {
      const tx = buildOrphanedTx();
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const useCase = buildUseCase({ transactions, gateway });

      await useCase.execute('tx-1');

      const stored = await transactions.findById('tx-1');
      expect(stored._unsafeUnwrap().lastGatewayCheckAt).toBe(NOW_ISO);
    });
  });

  describe('lazy-poll refresh (stale PENDING with a known gatewayTransactionId)', () => {
    function buildStaleTx(overrides: Partial<ReturnType<typeof buildTransaction>> = {}) {
      return buildTransaction({
        id: 'tx-1',
        status: 'PENDING',
        gatewayTransactionId: 'gw-1',
        productId: 'prod-1',
        customerId: 'cust-1',
        createdAt: '2026-09-24T00:00:00.000Z', // 10s ago, threshold is 3s -> stale
        ...overrides,
      });
    }

    it('queries the gateway and settles the transaction when the gateway reports a final status', async () => {
      const tx = buildStaleTx();
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('APPROVED');
      expect(gateway.getTransactionCallCount).toBe(1);
      expect(transactions.settleApprovedCalls).toHaveLength(1);
    });

    it('leaves the transaction PENDING when the gateway still reports PENDING', async () => {
      const tx = buildStaleTx();
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('PENDING');
    });

    it('always updates lastGatewayCheckAt after a poll attempt, even when the status did not change', async () => {
      const tx = buildStaleTx();
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
      const useCase = buildUseCase({ transactions, gateway });

      await useCase.execute('tx-1');

      const stored = await transactions.findById('tx-1');
      expect(stored._unsafeUnwrap().lastGatewayCheckAt).toBe(NOW_ISO);
    });

    it('never fails the GET even when touchLastGatewayCheckAt itself fails', async () => {
      const tx = buildStaleTx();
      const transactions = new FakeTransactionRepository([tx]);
      jest.spyOn(transactions, 'touchLastGatewayCheckAt').mockReturnValue(errAsync(new PaymentGatewayError('write failed')));
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('APPROVED');
    });

    it('returns the stored state (never fails the GET) and still updates lastGatewayCheckAt when the gateway call fails', async () => {
      const tx = buildStaleTx();
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort({ ok: false, error: new PaymentGatewayError('timeout') });
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.status).toBe('PENDING');
      const stored = await transactions.findById('tx-1');
      expect(stored._unsafeUnwrap().lastGatewayCheckAt).toBe(NOW_ISO);
    });
  });

  describe('delivery embedding', () => {
    it('embeds the delivery when the transaction is APPROVED', async () => {
      const tx = buildTransaction({ id: 'tx-1', status: 'APPROVED' });
      const delivery = buildDelivery({ transactionId: 'tx-1' });
      const transactions = new FakeTransactionRepository([tx]);
      const deliveries = new FakeDeliveryRepository([delivery]);
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'APPROVED' } });
      const useCase = buildUseCase({ transactions, deliveries, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().delivery).toEqual(delivery);
    });

    it('does not embed a delivery when the transaction is not APPROVED', async () => {
      const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', createdAt: NOW_ISO });
      const transactions = new FakeTransactionRepository([tx]);
      const gateway = new RecordingGatewayPort({ ok: true, value: { gatewayTransactionId: 'gw-1', status: 'PENDING' } });
      const useCase = buildUseCase({ transactions, gateway });

      const result = await useCase.execute('tx-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().delivery).toBeNull();
    });
  });
});
