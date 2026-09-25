import { Delivery } from '../../deliveries/domain/delivery.entity';
import { DeliveryRepositoryPort } from '../../deliveries/domain/delivery.repository.port';
import { AppResultAsync, okAsync } from '../../shared/result/result.types';
import { Transaction } from '../domain/transaction.entity';

export interface TransactionWithDelivery {
  transaction: Transaction;
  delivery: Delivery | null;
}

/**
 * Shared by `CreateTransactionUseCase` and `GetTransactionUseCase` (both
 * respond with an embedded delivery once a transaction is APPROVED) — never
 * looks up a delivery for a non-APPROVED transaction, since only settlement
 * to APPROVED creates one.
 */
export function attachDeliveryIfApproved(
  deliveries: DeliveryRepositoryPort,
  transaction: Transaction,
): AppResultAsync<TransactionWithDelivery> {
  if (transaction.status !== 'APPROVED') {
    return okAsync({ transaction, delivery: null });
  }

  return deliveries.findByTransactionId(transaction.id).map((delivery) => ({ transaction, delivery }));
}
