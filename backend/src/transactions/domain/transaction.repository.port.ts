import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { AppResultAsync } from '../../shared/result/result.types';
import { Transaction, TransactionDeliveryInfo } from './transaction.entity';
import { TransactionStatus } from './transaction-status.vo';

export interface CreatePendingTransactionInput {
  id: string;
  reference: string;
  customerId: string;
  productId: string;
  quantity: Quantity;
  unitPrice: Money;
  baseFee: Money;
  deliveryFee: Money;
  totalAmount: Money;
  delivery: TransactionDeliveryInfo;
  createdAt: string;
}

export interface UpdateGatewayResultInput {
  gatewayTransactionId?: string;
  status: TransactionStatus;
  lastGatewayCheckAt?: string;
  updatedAt: string;
}

export interface TransactionRepositoryPort {
  createPending(input: CreatePendingTransactionInput): AppResultAsync<Transaction>;
  /**
   * Updates a transaction's gateway-derived fields (status, and optionally
   * `gatewayTransactionId`/`lastGatewayCheckAt`). `gatewayTransactionId` is
   * omitted when the gateway call itself failed (network error/timeout) —
   * the transaction still transitions to `ERROR` in that case, just without
   * a gateway-issued id to reference.
   */
  updateGatewayResult(id: string, input: UpdateGatewayResultInput): AppResultAsync<Transaction>;
  findById(id: string): AppResultAsync<Transaction>;
}

export const TRANSACTION_REPOSITORY_PORT = Symbol('TRANSACTION_REPOSITORY_PORT');
