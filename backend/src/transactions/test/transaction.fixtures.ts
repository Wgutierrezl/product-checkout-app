import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { NotFoundError } from '../../shared/errors/domain-error';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { Transaction } from '../domain/transaction.entity';
import {
  CreatePendingResult,
  CreatePendingTransactionInput,
  TransactionRepositoryPort,
  UpdateGatewayResultInput,
} from '../domain/transaction.repository.port';

/**
 * Shared test fixtures for the transactions module's use-case and controller
 * specs. Test-only: never imported from production code.
 */

export function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    reference: 'REF-tx-1',
    customerId: 'cust-1',
    productId: 'prod-1',
    quantity: Quantity.create(2)._unsafeUnwrap(),
    unitPrice: Money.create(150_000)._unsafeUnwrap(),
    baseFee: Money.create(250_000)._unsafeUnwrap(),
    deliveryFee: Money.create(800_000)._unsafeUnwrap(),
    totalAmount: Money.create(1_350_000)._unsafeUnwrap(),
    status: 'PENDING',
    delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    ...overrides,
  };
}

export class FakeTransactionRepository implements TransactionRepositoryPort {
  constructor(private readonly transactions: Transaction[] = []) {}

  createPending(input: CreatePendingTransactionInput): AppResultAsync<CreatePendingResult> {
    const existing = this.transactions.find((transaction) => transaction.id === input.id);
    if (existing) {
      return okAsync({ transaction: existing, wasCreated: false });
    }

    const transaction: Transaction = {
      id: input.id,
      reference: input.reference,
      customerId: input.customerId,
      productId: input.productId,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      baseFee: input.baseFee,
      deliveryFee: input.deliveryFee,
      totalAmount: input.totalAmount,
      status: 'PENDING',
      delivery: input.delivery,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.transactions.push(transaction);
    return okAsync({ transaction, wasCreated: true });
  }

  updateGatewayResult(id: string, input: UpdateGatewayResultInput): AppResultAsync<Transaction> {
    const index = this.transactions.findIndex((transaction) => transaction.id === id);
    if (index === -1) {
      return errAsync(new NotFoundError(`Transaction ${id} not found`));
    }

    const updated: Transaction = {
      ...this.transactions[index],
      status: input.status,
      gatewayTransactionId: input.gatewayTransactionId ?? this.transactions[index].gatewayTransactionId,
      lastGatewayCheckAt: input.lastGatewayCheckAt ?? this.transactions[index].lastGatewayCheckAt,
      updatedAt: input.updatedAt,
    };
    this.transactions[index] = updated;
    return okAsync(updated);
  }

  findById(id: string): AppResultAsync<Transaction> {
    const found = this.transactions.find((transaction) => transaction.id === id);
    return found ? okAsync(found) : errAsync(new NotFoundError(`Transaction ${id} not found`));
  }
}
