import { ClockPort } from '../../shared/ports/clock.port';
import { IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { NotFoundError } from '../../shared/errors/domain-error';
import { buildTransaction, FakeTransactionRepository } from '../test/transaction.fixtures';
import { SettleTransactionUseCase } from './settle-transaction.use-case';

function buildFakeClock(iso: string): ClockPort {
  return { now: () => new Date(iso) };
}

class FixedIdGenerator implements IdGeneratorPort {
  constructor(private readonly id: string = 'delivery-1') {}
  newId(): string {
    return this.id;
  }
  newReference(): string {
    throw new Error('not used in this suite');
  }
}

function buildUseCase(options: {
  transactions: FakeTransactionRepository;
  clock?: ClockPort;
  ids?: IdGeneratorPort;
}) {
  return new SettleTransactionUseCase(
    options.transactions,
    options.ids ?? new FixedIdGenerator(),
    options.clock ?? buildFakeClock('2026-09-24T00:00:00.000Z'),
  );
}

describe('SettleTransactionUseCase', () => {
  it('returns NotFoundError for an unknown transaction id', async () => {
    const transactions = new FakeTransactionRepository([]);
    const useCase = buildUseCase({ transactions });

    const result = await useCase.execute({ transactionId: 'missing-id', gatewayStatus: 'APPROVED' });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  describe('APPROVED', () => {
    it('settles a PENDING transaction exactly once (approved settles once)', async () => {
      const tx = buildTransaction({ id: 'tx-1', productId: 'prod-1', customerId: 'cust-1', status: 'PENDING' });
      const transactions = new FakeTransactionRepository([tx]);
      const useCase = buildUseCase({ transactions });

      const result = await useCase.execute({ transactionId: 'tx-1', gatewayStatus: 'APPROVED', gatewayTransactionId: 'gw-1' });

      expect(result.isOk()).toBe(true);
      const settled = result._unsafeUnwrap();
      expect(settled.status).toBe('APPROVED');
      expect(settled.gatewayTransactionId).toBe('gw-1');
      expect(transactions.settleApprovedCalls).toHaveLength(1);
      expect(transactions.settleApprovedCalls[0]).toMatchObject({
        transactionId: 'tx-1',
        productId: 'prod-1',
        customerId: 'cust-1',
        deliveryId: 'delivery-1',
        gatewayTransactionId: 'gw-1',
        updatedAt: '2026-09-24T00:00:00.000Z',
      });
      expect(transactions.settleApprovedCalls[0].delivery).toEqual(tx.delivery);
      expect(transactions.settleApprovedCalls[0].quantity).toBe(tx.quantity);
    });

    it('is idempotent: a transaction already APPROVED (race loser) no-ops without calling settleApproved again', async () => {
      const tx = buildTransaction({ id: 'tx-1', status: 'APPROVED', gatewayTransactionId: 'gw-1' });
      const transactions = new FakeTransactionRepository([tx]);
      const useCase = buildUseCase({ transactions });

      const result = await useCase.execute({ transactionId: 'tx-1', gatewayStatus: 'APPROVED', gatewayTransactionId: 'gw-2' });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(tx);
      expect(transactions.settleApprovedCalls).toHaveLength(0);
    });
  });

  describe('non-approved (DECLINED/VOIDED/ERROR)', () => {
    it.each(['DECLINED', 'VOIDED', 'ERROR'] as const)(
      'finalizes a PENDING transaction as %s with no stock/delivery side effects',
      async (status) => {
        const tx = buildTransaction({ id: 'tx-1', status: 'PENDING' });
        const transactions = new FakeTransactionRepository([tx]);
        const useCase = buildUseCase({ transactions });

        const result = await useCase.execute({ transactionId: 'tx-1', gatewayStatus: status, gatewayTransactionId: 'gw-1' });

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap().status).toBe(status);
        expect(transactions.finalizeNonApprovedCalls).toHaveLength(1);
        expect(transactions.settleApprovedCalls).toHaveLength(0);
      },
    );

    it('is idempotent: an already-final transaction no-ops without calling finalizeNonApproved again', async () => {
      const tx = buildTransaction({ id: 'tx-1', status: 'DECLINED' });
      const transactions = new FakeTransactionRepository([tx]);
      const useCase = buildUseCase({ transactions });

      const result = await useCase.execute({ transactionId: 'tx-1', gatewayStatus: 'ERROR' });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(tx);
      expect(transactions.finalizeNonApprovedCalls).toHaveLength(0);
    });
  });

  describe('PENDING gateway status (nothing final to settle yet)', () => {
    it('records a newly-learned gatewayTransactionId without changing status', async () => {
      const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: undefined });
      const transactions = new FakeTransactionRepository([tx]);
      const useCase = buildUseCase({ transactions });

      const result = await useCase.execute({ transactionId: 'tx-1', gatewayStatus: 'PENDING', gatewayTransactionId: 'gw-1' });

      expect(result.isOk()).toBe(true);
      const updated = result._unsafeUnwrap();
      expect(updated.status).toBe('PENDING');
      expect(updated.gatewayTransactionId).toBe('gw-1');
    });

    it('no-ops when the gatewayTransactionId is already known (nothing new to persist)', async () => {
      const tx = buildTransaction({ id: 'tx-1', status: 'PENDING', gatewayTransactionId: 'gw-1' });
      const transactions = new FakeTransactionRepository([tx]);
      const updateSpy = jest.spyOn(transactions, 'updateGatewayResult');
      const useCase = buildUseCase({ transactions });

      const result = await useCase.execute({ transactionId: 'tx-1', gatewayStatus: 'PENDING', gatewayTransactionId: 'gw-1' });

      expect(result.isOk()).toBe(true);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});
