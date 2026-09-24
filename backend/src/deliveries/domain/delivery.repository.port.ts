import { AppResultAsync } from '../../shared/result/result.types';
import { Delivery } from './delivery.entity';

export interface DeliveryRepositoryPort {
  findById(id: string): AppResultAsync<Delivery>;
  /**
   * Looks up a delivery by transaction id. Returns `null` (not an error) when
   * no delivery exists yet — expected for a transaction that hasn't settled
   * as APPROVED yet (see `GET /transactions/:id` embedding, PR6).
   */
  findByTransactionId(transactionId: string): AppResultAsync<Delivery | null>;
}

export const DELIVERY_REPOSITORY_PORT = Symbol('DELIVERY_REPOSITORY_PORT');
