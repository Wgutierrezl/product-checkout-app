import { Inject, Injectable } from '@nestjs/common';

import { ValidationError } from '../../shared/errors/domain-error';
import { verifyWebhookChecksum, WebhookEventPayload } from '../../shared/payment-gateway/domain/webhook-checksum';
import {
  parseWebhookTransactionEvent,
  WebhookTransactionEvent,
} from '../../shared/payment-gateway/domain/webhook-transaction-event';
import { AppResultAsync, errAsync, okAsync } from '../../shared/result/result.types';
import { Transaction } from '../domain/transaction.entity';
import { TRANSACTION_REPOSITORY_PORT, TransactionRepositoryPort } from '../domain/transaction.repository.port';
import { SettleTransactionUseCase } from './settle-transaction.use-case';

export const EVENTS_SECRET = Symbol('EVENTS_SECRET');

/**
 * Handles `POST /transactions/webhook`. Verifies the checksum first — an
 * invalid checksum is rejected outright, never trusted enough to even look
 * up a transaction. A checksum-valid payload that doesn't resolve to a known
 * transaction (unknown gateway id/reference, or an unparseable shape) is
 * treated as a no-op success (`null`) rather than an error, so the endpoint
 * can always respond 200 quickly and idempotently, per spec.
 */
@Injectable()
export class HandleWebhookUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY_PORT) private readonly transactions: TransactionRepositoryPort,
    private readonly settleTransaction: SettleTransactionUseCase,
    @Inject(EVENTS_SECRET) private readonly eventsSecret: string,
  ) {}

  execute(payload: WebhookEventPayload): AppResultAsync<Transaction | null> {
    if (!verifyWebhookChecksum(payload, this.eventsSecret)) {
      return errAsync(new ValidationError('Webhook checksum verification failed'));
    }

    const event = parseWebhookTransactionEvent(payload);
    if (!event) {
      return okAsync(null);
    }

    return this.findTransaction(event).andThen((tx) => {
      if (!tx) {
        return okAsync(null);
      }

      return this.settleTransaction.execute({
        transactionId: tx.id,
        gatewayStatus: event.status,
        gatewayTransactionId: event.gatewayTransactionId,
      });
    });
  }

  /**
   * Prefers the `GatewayTxIndex` lookup; falls back to `reference` when the
   * gateway id isn't persisted yet — e.g. the webhook races in before the
   * synchronous `POST /transactions` call finishes storing it (`reference`
   * is written up-front, before the gateway is ever called).
   */
  private findTransaction(event: WebhookTransactionEvent): AppResultAsync<Transaction | null> {
    return this.transactions.findByGatewayTransactionId(event.gatewayTransactionId).andThen((tx) => {
      if (tx) {
        return okAsync(tx);
      }
      if (!event.reference) {
        return okAsync(null);
      }
      return this.transactions.findByReference(event.reference);
    });
  }
}
