import { Inject, Injectable, Logger } from '@nestjs/common';

import { GatewayTransactionStatus } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { CLOCK_PORT, ClockPort } from '../../shared/ports/clock.port';
import { ID_GENERATOR_PORT, IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { AppResultAsync, okAsync } from '../../shared/result/result.types';
import { Transaction } from '../domain/transaction.entity';
import {
  TRANSACTION_REPOSITORY_PORT,
  TransactionRepositoryPort,
} from '../domain/transaction.repository.port';

export interface SettleTransactionInput {
  transactionId: string;
  gatewayStatus: GatewayTransactionStatus;
  gatewayTransactionId?: string;
}

/**
 * Single entry point for applying a gateway-reported status to a
 * transaction — consumed by all three settlement paths per design: the
 * synchronous result of `POST /transactions` (via `CreateTransactionUseCase`),
 * the payment gateway webhook (`HandleWebhookUseCase`), and the lazy-poll
 * refresh on `GET /transactions/:id` (`GetTransactionUseCase`).
 *
 * Idempotent: if the transaction is already in a terminal (non-PENDING)
 * state by the time this runs, it is returned unchanged — this is the
 * expected "race loser" outcome when two of the three paths above settle the
 * same transaction concurrently, and is never treated as an error.
 */
@Injectable()
export class SettleTransactionUseCase {
  private readonly logger = new Logger(SettleTransactionUseCase.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY_PORT) private readonly transactions: TransactionRepositoryPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(input: SettleTransactionInput): AppResultAsync<Transaction> {
    return this.transactions.findById(input.transactionId).andThen((tx) => {
      if (tx.status !== 'PENDING') {
        // Already final — either settled by a concurrent caller (race loser)
        // or a stale/duplicate event arriving after the fact. Idempotent no-op.
        // A DIFFERENT incoming status than the one already stored is worth a
        // warning (e.g. APPROVED then later VOIDED) — it never changes
        // anything here, but it's a signal worth a human's attention.
        if (input.gatewayStatus !== 'PENDING' && input.gatewayStatus !== tx.status) {
          this.logger.warn(
            `Received a conflicting status for an already-final transaction: transactionId=${tx.id} ` +
              `currentStatus=${tx.status} incomingStatus=${input.gatewayStatus} — ignoring (idempotent no-op).`,
          );
        }
        return okAsync(tx);
      }

      if (input.gatewayStatus === 'PENDING') {
        return this.recordStillPending(tx, input.gatewayTransactionId);
      }

      if (input.gatewayStatus === 'APPROVED') {
        return this.transactions.settleApproved({
          transactionId: tx.id,
          productId: tx.productId,
          quantity: tx.quantity,
          customerId: tx.customerId,
          delivery: tx.delivery,
          deliveryId: this.ids.newId(),
          gatewayTransactionId: input.gatewayTransactionId,
          updatedAt: this.clock.now().toISOString(),
        });
      }

      return this.transactions.finalizeNonApproved({
        transactionId: tx.id,
        status: input.gatewayStatus,
        gatewayTransactionId: input.gatewayTransactionId,
        updatedAt: this.clock.now().toISOString(),
      });
    });
  }

  /**
   * Nothing final to settle yet — the only thing worth persisting is a
   * newly-learned `gatewayTransactionId` (e.g. the gateway just accepted the
   * charge and returned an id, still PENDING). Skipped entirely if there is
   * nothing new to record, so a repeated lazy-poll of a still-PENDING
   * transaction with an already-known gateway id performs no writes.
   */
  private recordStillPending(tx: Transaction, gatewayTransactionId?: string): AppResultAsync<Transaction> {
    if (!gatewayTransactionId || gatewayTransactionId === tx.gatewayTransactionId) {
      return okAsync(tx);
    }

    return this.transactions.updateGatewayResult(tx.id, {
      gatewayTransactionId,
      status: 'PENDING',
      updatedAt: this.clock.now().toISOString(),
    });
  }
}
