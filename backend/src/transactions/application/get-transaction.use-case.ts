import { Inject, Injectable, Logger } from '@nestjs/common';

import { DELIVERY_REPOSITORY_PORT, DeliveryRepositoryPort } from '../../deliveries/domain/delivery.repository.port';
import { CLOCK_PORT, ClockPort } from '../../shared/ports/clock.port';
import { PAYMENT_GATEWAY_PORT, PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
import { AppResultAsync, okAsync } from '../../shared/result/result.types';
import { Transaction } from '../domain/transaction.entity';
import { TRANSACTION_REPOSITORY_PORT, TransactionRepositoryPort } from '../domain/transaction.repository.port';
import { SettleTransactionUseCase } from './settle-transaction.use-case';
import { attachDeliveryIfApproved, TransactionWithDelivery } from './transaction-with-delivery';

export const LAZY_POLL_THRESHOLD_MS = Symbol('LAZY_POLL_THRESHOLD_MS');
export const RECONCILIATION_WINDOW_MS = Symbol('RECONCILIATION_WINDOW_MS');

export { TransactionWithDelivery };

/**
 * Read path for `GET /transactions/:id`, including the "lazy poll" refresh
 * (per design's hybrid settlement plan): a stale PENDING transaction is
 * checked against the gateway before responding, self-healing the status
 * without needing a public webhook URL. Two poll strategies:
 *
 * - A known `gatewayTransactionId` -> poll by id (`getTransaction`).
 * - No `gatewayTransactionId` yet (an AMBIGUOUS synchronous charge failure
 *   left the transaction PENDING with nothing to poll by id — see
 *   `CreateTransactionUseCase`) -> poll by reference (`getTransactionByReference`).
 *   If nothing is found AND the transaction has aged past
 *   `RECONCILIATION_WINDOW_MS` (default 10 minutes), it is marked ERROR —
 *   but ONLY once poll-by-reference has confirmed the gateway has no record
 *   of it, never on a mere timeout of our own reconciliation window alone.
 *
 * Delivery is embedded in the response only once the transaction is
 * APPROVED.
 */
@Injectable()
export class GetTransactionUseCase {
  private readonly logger = new Logger(GetTransactionUseCase.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY_PORT) private readonly transactions: TransactionRepositoryPort,
    @Inject(DELIVERY_REPOSITORY_PORT) private readonly deliveries: DeliveryRepositoryPort,
    @Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort,
    private readonly settleTransaction: SettleTransactionUseCase,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(LAZY_POLL_THRESHOLD_MS) private readonly lazyPollThresholdMs: number,
    @Inject(RECONCILIATION_WINDOW_MS) private readonly reconciliationWindowMs: number,
  ) {}

  execute(id: string): AppResultAsync<TransactionWithDelivery> {
    return this.transactions
      .findById(id)
      .andThen((tx) => this.maybePoll(tx))
      .andThen((tx) => attachDeliveryIfApproved(this.deliveries, tx));
  }

  private maybePoll(tx: Transaction): AppResultAsync<Transaction> {
    if (tx.status !== 'PENDING' || !this.isStale(tx)) {
      return okAsync(tx);
    }

    return tx.gatewayTransactionId ? this.pollById(tx, tx.gatewayTransactionId) : this.pollByReference(tx);
  }

  /**
   * Never fails the GET: a gateway error during the poll is logged and the
   * stored (still-PENDING) transaction is returned as-is. `lastGatewayCheckAt`
   * is always updated after an attempted poll, whether it changed the status
   * or not, so the staleness window resets and this doesn't hammer the
   * gateway on every request while a transaction genuinely stays PENDING.
   */
  private pollById(tx: Transaction, gatewayTransactionId: string): AppResultAsync<Transaction> {
    return this.gateway
      .getTransaction(gatewayTransactionId)
      .andThen((result) =>
        this.settleTransaction.execute({
          transactionId: tx.id,
          gatewayStatus: result.status,
          gatewayTransactionId: result.gatewayTransactionId,
        }),
      )
      .orElse((error) => {
        this.logger.warn(
          `Lazy-poll gateway check failed for transaction ${tx.id}, returning stored state: ${error.message}`,
        );
        return okAsync(tx);
      })
      .andThen((settled) => this.touchLastGatewayCheckAt(settled));
  }

  /**
   * The transaction has no `gatewayTransactionId` yet — an ambiguous
   * synchronous charge failure (see `CreateTransactionUseCase`). Poll by
   * `reference` instead. A confirmed non-existence past the reconciliation
   * window marks the transaction ERROR (via `SettleTransaction`, so it stays
   * atomic/idempotent with every other settlement path); anything short of
   * that just leaves it PENDING for the next poll or the webhook to resolve.
   */
  private pollByReference(tx: Transaction): AppResultAsync<Transaction> {
    return this.gateway
      .getTransactionByReference(tx.reference)
      .andThen((result) => {
        if (result) {
          return this.settleTransaction.execute({
            transactionId: tx.id,
            gatewayStatus: result.status,
            gatewayTransactionId: result.gatewayTransactionId,
          });
        }

        if (this.isPastReconciliationWindow(tx)) {
          this.logger.error(
            `Transaction ${tx.id} (reference=${tx.reference}) has no gatewayTransactionId, aged past the ` +
              'reconciliation window, and poll-by-reference confirms the gateway has no record of it — marking ERROR.',
          );
          return this.settleTransaction.execute({ transactionId: tx.id, gatewayStatus: 'ERROR' });
        }

        return okAsync(tx);
      })
      .orElse((error) => {
        this.logger.warn(
          `Poll-by-reference failed for transaction ${tx.id}, returning stored state: ${error.message}`,
        );
        return okAsync(tx);
      })
      .andThen((settled) => this.touchLastGatewayCheckAt(settled));
  }

  private touchLastGatewayCheckAt(settled: Transaction): AppResultAsync<Transaction> {
    const now = this.clock.now().toISOString();
    return this.transactions
      .touchLastGatewayCheckAt(settled.id, now)
      .orElse(() => okAsync(undefined))
      .map(() => settled);
  }

  private isStale(tx: Transaction): boolean {
    const referenceTime = tx.lastGatewayCheckAt ?? tx.createdAt;
    const elapsedMs = this.clock.now().getTime() - new Date(referenceTime).getTime();
    return elapsedMs >= this.lazyPollThresholdMs;
  }

  private isPastReconciliationWindow(tx: Transaction): boolean {
    const elapsedMs = this.clock.now().getTime() - new Date(tx.createdAt).getTime();
    return elapsedMs >= this.reconciliationWindowMs;
  }
}
