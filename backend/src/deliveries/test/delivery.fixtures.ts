import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { Delivery } from '../domain/delivery.entity';
import { DeliveryRepositoryPort } from '../domain/delivery.repository.port';

/**
 * Shared test fixtures for the deliveries module's use-case and controller
 * specs. Test-only: never imported from production code.
 */

export function buildDelivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 'delivery-1',
    transactionId: 'txn-1',
    customerId: 'cust-1',
    address: 'Cra 7 # 71-21',
    city: 'Bogotá',
    region: 'Cundinamarca',
    postalCode: '110231',
    status: 'CREATED',
    createdAt: '2026-09-23T00:00:00.000Z',
    ...overrides,
  };
}

export class FakeDeliveryRepository implements DeliveryRepositoryPort {
  constructor(private readonly deliveries: Delivery[] = []) {}

  findById(id: string) {
    const found = this.deliveries.find((delivery) => delivery.id === id);
    return found ? okAsync(found) : errAsync(new NotFoundError(`Delivery ${id} not found`));
  }

  findByTransactionId(transactionId: string) {
    const found = this.deliveries.find((delivery) => delivery.transactionId === transactionId);
    return okAsync(found ?? null);
  }
}
