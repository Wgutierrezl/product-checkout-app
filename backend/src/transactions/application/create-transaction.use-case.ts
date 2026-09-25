import { Inject, Injectable, Logger } from '@nestjs/common';
import { Result, ResultAsync } from 'neverthrow';

import { CUSTOMER_REPOSITORY_PORT, CustomerRepositoryPort } from '../../customers/domain/customer.repository.port';
import { Customer } from '../../customers/domain/customer.entity';
import { DELIVERY_REPOSITORY_PORT, DeliveryRepositoryPort } from '../../deliveries/domain/delivery.repository.port';
import { Product } from '../../products/domain/product.entity';
import { PRODUCT_REPOSITORY_PORT, ProductRepositoryPort } from '../../products/domain/product.repository.port';
import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { DomainError, InsufficientStockError, NotFoundError, PaymentGatewayError } from '../../shared/errors/domain-error';
import { buildIntegritySignature } from '../../shared/payment-gateway/domain/integrity-signature';
import { PAYMENT_GATEWAY_PORT, PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
import { CreateCardTransactionInput, GatewayTransactionResult } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { CLOCK_PORT, ClockPort } from '../../shared/ports/clock.port';
import { ID_GENERATOR_PORT, IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { AppResult, AppResultAsync, err, errAsync, ok, okAsync } from '../../shared/result/result.types';
import { Transaction, TransactionDeliveryInfo } from '../domain/transaction.entity';
import {
  CreatePendingResult,
  TRANSACTION_REPOSITORY_PORT,
  TransactionRepositoryPort,
} from '../domain/transaction.repository.port';
import { SettleTransactionUseCase } from './settle-transaction.use-case';
import { attachDeliveryIfApproved, TransactionWithDelivery } from './transaction-with-delivery';

export const FEES_CONFIG = Symbol('FEES_CONFIG');
export const INTEGRITY_SECRET = Symbol('INTEGRITY_SECRET');

export interface FeesConfig {
  baseFeeCents: number;
  deliveryFeeCents: number;
}

export interface CreateTransactionCustomerInput {
  fullName: string;
  email: string;
  phone: string;
}

export interface CreateTransactionCommand {
  /** Client-generated UUID v4, one per checkout attempt. See CreateTransactionDto. */
  idempotencyKey: string;
  productId: string;
  quantity: number;
  customer: CreateTransactionCustomerInput;
  delivery: TransactionDeliveryInfo;
  cardToken: string;
  installments: number;
  acceptanceToken: string;
  acceptPersonalAuth: string;
}

interface AmountBreakdown {
  baseFee: Money;
  deliveryFee: Money;
  totalAmount: Money;
}

interface PricedProduct {
  command: CreateTransactionCommand;
  quantity: Quantity;
  product: Product;
  amount: AmountBreakdown;
}

interface PendingState extends PricedProduct {
  customer: Customer;
}

/**
 * ROP pipeline (per design.md): return the existing transaction on an
 * idempotent replay; otherwise validate quantity -> load product (404) ->
 * check stock (409) -> compute server-side total -> upsert customer by
 * email -> persist a PENDING transaction with a unique reference -> build
 * the integrity signature -> call the gateway -> settle the result.
 *
 * EVERY synchronous gateway result (including a still-PENDING one) routes
 * through `SettleTransactionUseCase` — the single entry point shared with
 * the webhook and lazy-poll paths — so a webhook racing in before this call
 * finishes can never observe or create an inconsistent state.
 *
 * A gateway CALL failure (network/timeout/HTTP error, as opposed to a
 * successful call that returned e.g. DECLINED) is classified AMBIGUOUS vs
 * DEFINITE (see `PaymentGatewayError.ambiguous`):
 * - DEFINITE (the gateway explicitly rejected the request, e.g. 4xx) -> the
 *   transaction is marked ERROR and the original error is propagated (502).
 * - AMBIGUOUS (timeout, network error, 5xx, or a malformed body after a 2xx
 *   — the request may still have gone through) -> the transaction is left
 *   PENDING with no gatewayTransactionId, logged for reconciliation, and
 *   `execute()` still resolves Ok with the PENDING transaction (201) — the
 *   client polls, and the lazy-poll-by-reference / webhook paths resolve it.
 *
 * A gateway response that synchronously reports DECLINED/ERROR (a
 * successful CALL, an unfavorable business OUTCOME) is NOT a pipeline
 * failure — settled and returned with a 201.
 *
 * `cardToken` is used only to build the gateway request body — it is never
 * read back off `Transaction` or persisted (see spec's Sensitive Data
 * Protection requirement).
 */
@Injectable()
export class CreateTransactionUseCase {
  private readonly logger = new Logger(CreateTransactionUseCase.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY_PORT) private readonly products: ProductRepositoryPort,
    @Inject(CUSTOMER_REPOSITORY_PORT) private readonly customers: CustomerRepositoryPort,
    @Inject(TRANSACTION_REPOSITORY_PORT) private readonly transactions: TransactionRepositoryPort,
    @Inject(DELIVERY_REPOSITORY_PORT) private readonly deliveries: DeliveryRepositoryPort,
    @Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort,
    private readonly settleTransaction: SettleTransactionUseCase,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(FEES_CONFIG) private readonly fees: FeesConfig,
    @Inject(INTEGRITY_SECRET) private readonly integritySecret: string,
  ) {}

  /**
   * Idempotent replay FIRST: when a transaction with this idempotencyKey
   * already exists (e.g. the client timed out and retried), return it as-is
   * before ANY product, stock or amount validation and without calling the
   * gateway — otherwise a retry of a request that bought the last unit would
   * get a 409 even though the buyer was charged. The replay body is not
   * compared with the stored one: a different productId/quantity under the
   * same key still gets the original transaction back.
   *
   * This lookup is only an ordering fix and a shortcut; the conditional
   * write in `persistPending` remains the real guard for two concurrent
   * first requests (both miss the lookup, only one row and one charge win).
   */
  execute(command: CreateTransactionCommand): AppResultAsync<TransactionWithDelivery> {
    return this.findExisting(command.idempotencyKey)
      .andThen((existing) => (existing ? okAsync(existing) : this.createAndCharge(command)))
      .andThen((transaction) => attachDeliveryIfApproved(this.deliveries, transaction));
  }

  private findExisting(idempotencyKey: string): AppResultAsync<Transaction | null> {
    return this.transactions
      .findById(idempotencyKey)
      .map((transaction): Transaction | null => transaction)
      .orElse((error) => (error instanceof NotFoundError ? okAsync(null) : errAsync(error)));
  }

  private createAndCharge(command: CreateTransactionCommand): AppResultAsync<Transaction> {
    return Quantity.create(command.quantity)
      .asyncAndThen((quantity) =>
        this.products.findById(command.productId).map((product) => ({ command, quantity, product })),
      )
      .andThen(({ command: cmd, quantity, product }) =>
        this.ensureStock(product, quantity).map(() => ({ command: cmd, quantity, product })),
      )
      .andThen(({ command: cmd, quantity, product }) =>
        this.computeAmount(product.price, quantity).map((amount) => ({ command: cmd, quantity, product, amount })),
      )
      .andThen((priced) =>
        this.upsertCustomer(priced.command.customer).map((customer) => ({ ...priced, customer })),
      )
      .andThen((state) => this.persistPending(state))
      .andThen(({ transaction, wasCreated }) =>
        // Concurrent first requests with the same idempotencyKey: both missed
        // `findExisting`, and the conditional write let only one of them
        // create the row. The loser returns it as-is — the gateway must NEVER
        // be charged twice for the same checkout attempt.
        wasCreated ? this.chargeGateway(transaction, command) : okAsync(transaction),
      );
  }

  private ensureStock(product: Product, quantity: Quantity): AppResult<void> {
    if (!product.stock.canFulfill(quantity)) {
      return err(
        new InsufficientStockError(
          `Product ${product.id} has insufficient stock for quantity ${quantity.value}`,
        ),
      );
    }
    return ok(undefined);
  }

  private computeAmount(unitPrice: Money, quantity: Quantity): AppResult<AmountBreakdown> {
    return Money.create(this.fees.baseFeeCents).andThen((baseFee) =>
      Money.create(this.fees.deliveryFeeCents).andThen((deliveryFee) =>
        unitPrice
          .multiply(quantity.value)
          .andThen((productAmount) => productAmount.add(baseFee))
          .andThen((withBaseFee) => withBaseFee.add(deliveryFee))
          .map((totalAmount) => ({ baseFee, deliveryFee, totalAmount })),
      ),
    );
  }

  private upsertCustomer(input: CreateTransactionCustomerInput): AppResultAsync<Customer> {
    return this.customers.findByEmail(input.email).andThen((existing) => {
      if (existing) {
        return okAsync(existing);
      }

      return Customer.create({ id: this.ids.newId(), ...input }).asyncAndThen((customer) =>
        this.customers.create(customer),
      );
    });
  }

  private persistPending(state: PendingState): AppResultAsync<CreatePendingResult> {
    return this.transactions.createPending({
      id: state.command.idempotencyKey,
      reference: this.ids.newReference(),
      customerId: state.customer.id,
      productId: state.product.id,
      quantity: state.quantity,
      unitPrice: state.product.price,
      baseFee: state.amount.baseFee,
      deliveryFee: state.amount.deliveryFee,
      totalAmount: state.amount.totalAmount,
      delivery: state.command.delivery,
      createdAt: this.clock.now().toISOString(),
    });
  }

  /**
   * CRITICAL: the gateway CALL and the PERSISTENCE of its result are two
   * entirely different failure domains and must NEVER share the same error
   * handler. `handleChargeFailure` classifies "did the gateway even accept
   * the request" (definite rejection vs ambiguous) — that question is
   * meaningless for a persistence failure that happens AFTER a successful
   * call (e.g. `settleApproved`'s DB write failing twice after the gateway
   * already approved and charged the card). Routing a persistence failure
   * through `handleChargeFailure` would misclassify it as a "definite
   * gateway rejection" and wrongly mark an actually-approved, actually-
   * charged transaction as ERROR.
   *
   * `runCharge` keeps the two branches fully separate by inspecting the
   * gateway call's `Result` directly instead of chaining `.andThen().orElse()`
   * (which cannot distinguish which step produced an error once both are in
   * the same pipeline). `chargeGateway` just bridges that back into
   * `AppResultAsync` for the rest of the ROP pipeline.
   */
  private chargeGateway(
    transaction: Transaction,
    command: CreateTransactionCommand,
  ): AppResultAsync<Transaction> {
    const signature = buildIntegritySignature({
      reference: transaction.reference,
      amountInCents: transaction.totalAmount.valueInCents,
      currency: 'COP',
      integritySecret: this.integritySecret,
    });
    const input: CreateCardTransactionInput = {
      amountInCents: transaction.totalAmount.valueInCents,
      currency: 'COP',
      customerEmail: command.customer.email,
      reference: transaction.reference,
      acceptanceToken: command.acceptanceToken,
      acceptPersonalAuth: command.acceptPersonalAuth,
      signature,
      cardToken: command.cardToken,
      installments: command.installments,
    };

    return new ResultAsync(this.runCharge(transaction, input));
  }

  private async runCharge(
    transaction: Transaction,
    input: CreateCardTransactionInput,
  ): Promise<Result<Transaction, DomainError>> {
    const callResult = await this.gateway.createCardTransaction(input);

    if (callResult.isErr()) {
      // Only a gateway CALL failure ever reaches handleChargeFailure.
      return this.handleChargeFailure(transaction, callResult.error);
    }

    return this.persistSynchronousResult(transaction, callResult.value);
  }

  /**
   * The gateway CALL already succeeded by the time this runs (any status,
   * including PENDING) — an "orphaned charge" (money moved, our own record
   * never updated) is the worst possible outcome for the side-effect-bearing
   * statuses, but even a plain PENDING write is retried for consistency. Log
   * enough to manually reconcile (never PII, never the card token) and retry
   * the settlement once before giving up. If BOTH attempts fail, this is a
   * pure persistence failure — NEVER mark the transaction ERROR (the gateway
   * outcome, whatever it was, is real; only our own write failed). Instead,
   * fall back to `recordOrphanedChargeAttempt`.
   *
   * Every status — including PENDING — routes through `SettleTransaction`
   * (the single entry point for all settlement paths, see PR6 design), which
   * itself uses condition-guarded writes. This means there are NO
   * unconditioned status writes left in this use case.
   */
  private persistSynchronousResult(
    transaction: Transaction,
    gatewayResult: GatewayTransactionResult,
  ): AppResultAsync<Transaction> {
    const settle = () =>
      this.settleTransaction.execute({
        transactionId: transaction.id,
        gatewayStatus: gatewayResult.status,
        gatewayTransactionId: gatewayResult.gatewayTransactionId,
      });

    return settle().orElse((persistError) => {
      this.logger.error(
        `Failed to persist gateway result, retrying once: transactionId=${transaction.id} ` +
          `reference=${transaction.reference} gatewayTransactionId=${gatewayResult.gatewayTransactionId} ` +
          `gatewayStatus=${gatewayResult.status}: ${persistError.message}`,
      );
      return settle().orElse((retryError) =>
        this.recordOrphanedChargeAttempt(transaction, gatewayResult, retryError),
      );
    });
  }

  /**
   * Both settlement attempts failed after a gateway CALL that already
   * succeeded (the gateway reported SOME status — the charge may well have
   * gone through). This is an orphaned write, not a gateway rejection, and
   * must NEVER be routed through `handleChargeFailure`. Best-effort: attempt
   * a lightweight conditioned write that ONLY records `gatewayTransactionId`
   * while leaving `status` PENDING, so a later lazy-poll or webhook can still
   * resolve the real outcome. A failure of this best-effort write is only
   * logged, never allowed to replace the real (original) error. Always
   * propagates the ORIGINAL retry error so the caller (and the client, via a
   * 502) knows persistence failed — but the transaction stays PENDING, never
   * ERROR.
   */
  private recordOrphanedChargeAttempt(
    transaction: Transaction,
    gatewayResult: GatewayTransactionResult,
    retryError: DomainError,
  ): AppResultAsync<Transaction> {
    this.logger.error(
      `Failed to persist gateway result after retry — leaving transaction PENDING for reconciliation: ` +
        `transactionId=${transaction.id} reference=${transaction.reference} ` +
        `gatewayTransactionId=${gatewayResult.gatewayTransactionId} gatewayStatus=${gatewayResult.status}: ${retryError.message}`,
    );

    return this.transactions
      .updateGatewayResult(transaction.id, {
        gatewayTransactionId: gatewayResult.gatewayTransactionId,
        status: 'PENDING',
        updatedAt: this.clock.now().toISOString(),
      })
      .orElse((fallbackError) => {
        this.logger.error(
          `Best-effort fallback write also failed for transaction ${transaction.id}: ${fallbackError.message}`,
        );
        return okAsync(transaction);
      })
      .andThen(() => errAsync(retryError));
  }

  /**
   * The gateway CALL itself failed — classify it before deciding what to do:
   * - AMBIGUOUS (`PaymentGatewayError.ambiguous === true`: timeout, network
   *   error, 5xx, or a malformed body after a 2xx) — we genuinely don't know
   *   if the charge went through. Leave the transaction PENDING (no
   *   gatewayTransactionId), log for reconciliation, and resolve Ok so the
   *   client gets 201 PENDING and polls — never assume the charge failed.
   * - DEFINITE (anything else, e.g. a 4xx the gateway explicitly rejected
   *   before processing) — mark the transaction ERROR via `SettleTransaction`
   *   and propagate the ORIGINAL error (502), even if finalizing ERROR
   *   itself also fails (that secondary failure is only logged, never
   *   swallows or replaces the real cause of the 502).
   */
  private async handleChargeFailure(
    transaction: Transaction,
    error: DomainError,
  ): Promise<Result<Transaction, DomainError>> {
    if (this.isAmbiguousGatewayFailure(error)) {
      this.logger.error(
        'Ambiguous payment gateway failure (network/timeout/5xx/malformed response) — the charge may have ' +
          `gone through. Leaving transaction PENDING for reconciliation via lazy-poll/webhook: ` +
          `transactionId=${transaction.id} reference=${transaction.reference}: ${error.message}`,
      );
      return ok(transaction);
    }

    const finalizeResult = await this.settleTransaction.execute({
      transactionId: transaction.id,
      gatewayStatus: 'ERROR',
    });

    if (finalizeResult.isErr()) {
      this.logger.error(
        `Failed to finalize transaction ERROR after a definite gateway rejection: transactionId=${transaction.id} ` +
          `reference=${transaction.reference}: ${finalizeResult.error.message}`,
      );
    }

    return err(error);
  }

  private isAmbiguousGatewayFailure(error: DomainError): boolean {
    return error instanceof PaymentGatewayError && error.ambiguous;
  }
}
