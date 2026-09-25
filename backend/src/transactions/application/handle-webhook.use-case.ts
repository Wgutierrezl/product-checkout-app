import { Inject, Injectable, Logger } from '@nestjs/common';

import { ValidationError } from '../../shared/errors/domain-error';
import { PAYMENT_GATEWAY_PORT, PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
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

/** This whole system is COP-only: every price and total is in COP cents. */
const TRANSACTION_CURRENCY = 'COP';

const AMOUNT_PROPERTY_PATH = 'transaction.amount_in_cents';
const CURRENCY_PROPERTY_PATH = 'transaction.currency';

interface VerifiedAmount {
  amountInCents?: number;
  currency?: string;
}

/**
 * Handles `POST /transactions/webhook`. Verifies the checksum first — an
 * invalid checksum is rejected outright, never trusted enough to even look
 * up a transaction. A checksum-valid payload that doesn't resolve to a known
 * transaction (unknown gateway id/reference, or an unparseable shape) is
 * treated as a no-op success (`null`) rather than an error, so the endpoint
 * can always respond 200 quickly and idempotently: the gateway retries an
 * event that does not get a 200, and may deliver the same event twice.
 */
@Injectable()
export class HandleWebhookUseCase {
  private readonly logger = new Logger(HandleWebhookUseCase.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY_PORT) private readonly transactions: TransactionRepositoryPort,
    private readonly settleTransaction: SettleTransactionUseCase,
    @Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort,
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

      return this.resolveVerifiedAmount(payload, event)
        .andThen((verified) => {
          if (!this.amountMatches(verified, tx)) {
            this.logger.error(
              `Webhook amount/currency mismatch — refusing to settle: transactionId=${tx.id} ` +
                `reference=${tx.reference} storedAmountCents=${tx.totalAmount.valueInCents} ` +
                `verifiedAmountCents=${verified.amountInCents} verifiedCurrency=${verified.currency}`,
            );
            return okAsync(null);
          }

          return this.settleTransaction.execute({
            transactionId: tx.id,
            gatewayStatus: event.status,
            gatewayTransactionId: event.gatewayTransactionId,
          });
        })
        .orElse((error) => {
          this.logger.error(
            `Failed to verify webhook amount via gateway fallback — refusing to settle: transactionId=${tx.id} ` +
              `reference=${tx.reference}: ${error.message}`,
          );
          return okAsync(null);
        });
    });
  }

  /**
   * `signature.properties` is the checksum's tamper-evident contract — a
   * field NOT listed there is NOT covered by `verifyWebhookChecksum`, even
   * if it's present in `data.transaction`. Trust `amount_in_cents`/`currency`
   * straight from the event ONLY when each is actually signed; otherwise
   * fetch the authoritative value from the gateway directly by id (a single
   * `getTransaction` call covers whichever of the two needs it) instead of
   * trusting an unsigned, tamperable payload field.
   */
  private resolveVerifiedAmount(
    payload: WebhookEventPayload,
    event: WebhookTransactionEvent,
  ): AppResultAsync<VerifiedAmount> {
    const signedProperties = payload.signature.properties;
    const amountSigned = signedProperties.includes(AMOUNT_PROPERTY_PATH);
    const currencySigned = signedProperties.includes(CURRENCY_PROPERTY_PATH);
    const amountNeedsFallback = event.amountInCents !== undefined && !amountSigned;
    const currencyNeedsFallback = event.currency !== undefined && !currencySigned;

    if (!amountNeedsFallback && !currencyNeedsFallback) {
      return okAsync({ amountInCents: event.amountInCents, currency: event.currency });
    }

    this.logger.warn(
      `Webhook amount/currency not covered by the checksum (signature.properties) — fetching the ` +
        `authoritative value from the gateway instead: gatewayTransactionId=${event.gatewayTransactionId}`,
    );

    return this.gateway.getTransaction(event.gatewayTransactionId).map((result) => ({
      amountInCents: amountNeedsFallback ? result.amountInCents : event.amountInCents,
      currency: currencyNeedsFallback ? result.currency : event.currency,
    }));
  }

  /**
   * A mismatch means the (now-verified) amount/currency don't describe the
   * transaction they claim to — refuse to settle rather than trust it.
   * Missing fields are NOT a mismatch: not every event/gateway response is
   * guaranteed to carry an amount, and this check only runs when there is
   * something concrete to compare.
   */
  private amountMatches(verified: VerifiedAmount, tx: Transaction): boolean {
    if (verified.amountInCents !== undefined && verified.amountInCents !== tx.totalAmount.valueInCents) {
      return false;
    }
    if (verified.currency !== undefined && verified.currency !== TRANSACTION_CURRENCY) {
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
