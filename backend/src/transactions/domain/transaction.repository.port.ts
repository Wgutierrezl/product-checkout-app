import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { AppResultAsync } from '../../shared/result/result.types';
import { Transaction, TransactionDeliveryInfo } from './transaction.entity';
import { TransactionStatus } from './transaction-status.vo';

export interface CreatePendingTransactionInput {
  /**
   * The client-supplied idempotency key (a UUID v4, see
   * `CreateTransactionDto.idempotencyKey`) — used directly as the
   * transaction's id so a retried checkout request with the same key always
   * lands on the same row instead of creating a duplicate.
   */
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

export interface CreatePendingResult {
  transaction: Transaction;
  /**
   * `false` means `id` already existed (an idempotent replay of a prior
   * request with the same `idempotencyKey`) and `transaction` is that
   * pre-existing row, unchanged — callers MUST NOT charge the gateway again
   * in that case. `true` means a brand-new PENDING row was just inserted.
   */
  wasCreated: boolean;
}

export interface UpdateGatewayResultInput {
  gatewayTransactionId?: string;
  status: TransactionStatus;
  lastGatewayCheckAt?: string;
  updatedAt: string;
}

export interface TransactionRepositoryPort {
  /**
   * Idempotent by `input.id`: if a transaction with this id already exists
   * (a replay of a request with the same `idempotencyKey`), returns that
   * existing row with `wasCreated: false` instead of failing or overwriting
   * it. Never re-runs any side effect implied by a fresh creation.
   */
  createPending(input: CreatePendingTransactionInput): AppResultAsync<CreatePendingResult>;
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
