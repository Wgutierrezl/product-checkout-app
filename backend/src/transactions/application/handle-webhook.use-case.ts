import { Inject, Injectable, Logger } from '@nestjs/common';

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

/** This whole system is COP-only — see design ADR-6. */
const TRANSACTION_CURRENCY = 'COP';

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
  private readonly logger = new Logger(HandleWebhookUseCase.name);

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

      if (!this.amountMatches(event, tx)) {
        this.logger.error(
          `Webhook amount/currency mismatch — refusing to settle: transactionId=${tx.id} ` +
            `reference=${tx.reference} storedAmountCents=${tx.totalAmount.valueInCents} ` +
            `eventAmountCents=${event.amountInCents} eventCurrency=${event.currency}`,
        );
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
   * A mismatch means the webhook event doesn't describe the transaction it
   * claims to — refuse to settle rather than trust it. Missing fields are
   * NOT a mismatch: not every event type is guaranteed to carry an amount,
   * and this check only runs when there is something concrete to compare.
   */
  private amountMatches(event: WebhookTransactionEvent, tx: Transaction): boolean {
    if (event.amountInCents !== undefined && event.amountInCents !== tx.totalAmount.valueInCents) {
      return false;
    }
    if (event.currency !== undefined && event.currency !== TRANSACTION_CURRENCY) {
      return false;
    }
    return true;
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
