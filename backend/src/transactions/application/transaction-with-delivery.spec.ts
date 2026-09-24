import { buildDelivery, FakeDeliveryRepository } from '../../deliveries/test/delivery.fixtures';
import { buildTransaction } from '../test/transaction.fixtures';
import { attachDeliveryIfApproved } from './transaction-with-delivery';

describe('attachDeliveryIfApproved', () => {
  it('embeds the delivery when the transaction is APPROVED', async () => {
    const transaction = buildTransaction({ id: 'tx-1', status: 'APPROVED' });
    const delivery = buildDelivery({ transactionId: 'tx-1' });
    const deliveries = new FakeDeliveryRepository([delivery]);

    const result = await attachDeliveryIfApproved(deliveries, transaction);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ transaction, delivery });
  });

  it('does not look up a delivery when the transaction is not APPROVED', async () => {
    const transaction = buildTransaction({ id: 'tx-1', status: 'PENDING' });
    const deliveries = new FakeDeliveryRepository([]);
    const findSpy = jest.spyOn(deliveries, 'findByTransactionId');

    const result = await attachDeliveryIfApproved(deliveries, transaction);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ transaction, delivery: null });
    expect(findSpy).not.toHaveBeenCalled();
  });
});
