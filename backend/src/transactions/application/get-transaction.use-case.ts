import { Inject, Injectable, Logger } from '@nestjs/common';

import { DELIVERY_REPOSITORY_PORT, DeliveryRepositoryPort } from '../../deliveries/domain/delivery.repository.port';
import { Delivery } from '../../deliveries/domain/delivery.entity';
import { CLOCK_PORT, ClockPort } from '../../shared/ports/clock.port';
import { PAYMENT_GATEWAY_PORT, PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
import { AppResultAsync, okAsync } from '../../shared/result/result.types';
import { Transaction } from '../domain/transaction.entity';
import { TRANSACTION_REPOSITORY_PORT, TransactionRepositoryPort } from '../domain/transaction.repository.port';
import { SettleTransactionUseCase } from './settle-transaction.use-case';

export const LAZY_POLL_THRESHOLD_MS = Symbol('LAZY_POLL_THRESHOLD_MS');

export interface TransactionWithDelivery {
  transaction: Transaction;
  delivery: Delivery | null;
}

/**
 * Read path for `GET /transactions/:id`, including the "lazy poll" refresh
 * (per design's hybrid settlement plan): a stale PENDING transaction with a
 * known `gatewayTransactionId` is checked against the gateway before
 * responding, self-healing the status without needing a public webhook URL.
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
  ) {}

  execute(id: string): AppResultAsync<TransactionWithDelivery> {
    return this.transactions
      .findById(id)
      .andThen((tx) => this.maybePoll(tx))
      .andThen((tx) => this.attachDelivery(tx));
  }

  /**
   * Never fails the GET: a gateway error during the poll is logged and the
   * stored (still-PENDING) transaction is returned as-is. `lastGatewayCheckAt`
   * is always updated after an attempted poll, whether it changed the status
   * or not, so the staleness window resets and this doesn't hammer the
   * gateway on every request while a transaction genuinely stays PENDING.
   */
  private maybePoll(tx: Transaction): AppResultAsync<Transaction> {
    if (tx.status !== 'PENDING' || !tx.gatewayTransactionId || !this.isStale(tx)) {
      return okAsync(tx);
    }

    const now = this.clock.now().toISOString();

    return this.gateway
      .getTransaction(tx.gatewayTransactionId)
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
      .andThen((settled) =>
        this.transactions
          .touchLastGatewayCheckAt(settled.id, now)
          .orElse(() => okAsync(undefined))
          .map(() => settled),
      );
  }

  private isStale(tx: Transaction): boolean {
    const referenceTime = tx.lastGatewayCheckAt ?? tx.createdAt;
    const elapsedMs = this.clock.now().getTime() - new Date(referenceTime).getTime();
    return elapsedMs >= this.lazyPollThresholdMs;
  }

  private attachDelivery(tx: Transaction): AppResultAsync<TransactionWithDelivery> {
    if (tx.status !== 'APPROVED') {
      return okAsync({ transaction: tx, delivery: null });
    }

    return this.deliveries.findByTransactionId(tx.id).map((delivery) => ({ transaction: tx, delivery }));
  }
}
