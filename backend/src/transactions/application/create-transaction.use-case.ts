import { Inject, Injectable, Logger } from '@nestjs/common';

import { Customer } from '../../customers/domain/customer.entity';
import { CUSTOMER_REPOSITORY_PORT, CustomerRepositoryPort } from '../../customers/domain/customer.repository.port';
import { Product } from '../../products/domain/product.entity';
import { PRODUCT_REPOSITORY_PORT, ProductRepositoryPort } from '../../products/domain/product.repository.port';
import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { DomainError, InsufficientStockError } from '../../shared/errors/domain-error';
import { buildIntegritySignature } from '../../shared/payment-gateway/domain/integrity-signature';
import { PAYMENT_GATEWAY_PORT, PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
import { GatewayTransactionResult } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { CLOCK_PORT, ClockPort } from '../../shared/ports/clock.port';
import { ID_GENERATOR_PORT, IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { AppResult, AppResultAsync, err, errAsync, ok, okAsync } from '../../shared/result/result.types';
import { Transaction, TransactionDeliveryInfo } from '../domain/transaction.entity';
import {
  CreatePendingResult,
  TRANSACTION_REPOSITORY_PORT,
  TransactionRepositoryPort,
} from '../domain/transaction.repository.port';

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
 * ROP pipeline (per design.md): validate quantity -> load product (404) ->
 * check stock (409) -> compute server-side total -> upsert customer by
 * email -> persist a PENDING transaction with a unique reference -> build
 * the integrity signature -> call the gateway -> store the gateway result.
 *
 * If the gateway call itself fails (network/timeout), the transaction is
 * still persisted, now as ERROR, and the original PaymentGatewayError is
 * propagated so the controller maps it to 502. A gateway response that
 * synchronously reports DECLINED/ERROR is NOT a pipeline failure — it is a
 * valid business outcome, stored as-is and returned with a 201.
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
    @Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(FEES_CONFIG) private readonly fees: FeesConfig,
    @Inject(INTEGRITY_SECRET) private readonly integritySecret: string,
  ) {}

  execute(command: CreateTransactionCommand): AppResultAsync<Transaction> {
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
        // Idempotent replay: a transaction with this idempotencyKey already
        // exists (e.g. the frontend retried after a network timeout on its
        // first attempt). Return it as-is — the gateway must NEVER be
        // charged twice for the same checkout attempt.
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

    return this.gateway
      .createCardTransaction({
        amountInCents: transaction.totalAmount.valueInCents,
        currency: 'COP',
        customerEmail: command.customer.email,
        reference: transaction.reference,
        acceptanceToken: command.acceptanceToken,
        acceptPersonalAuth: command.acceptPersonalAuth,
        signature,
        cardToken: command.cardToken,
        installments: command.installments,
      })
      .andThen((gatewayResult) => this.persistGatewayResult(transaction, gatewayResult))
      .orElse((error) => this.persistErrorStatus(transaction, error));
  }

  /**
   * The gateway charge already succeeded by the time this runs — an
   * "orphaned charge" (money moved, our own record never updated) is the
   * worst possible outcome here. Log enough to manually reconcile (never
   * PII, never the card token) and retry the write once before giving up.
   */
  private persistGatewayResult(
    transaction: Transaction,
    gatewayResult: GatewayTransactionResult,
  ): AppResultAsync<Transaction> {
    const input = {
      gatewayTransactionId: gatewayResult.gatewayTransactionId,
      status: gatewayResult.status,
      updatedAt: this.clock.now().toISOString(),
    };

    return this.transactions.updateGatewayResult(transaction.id, input).orElse((persistError) => {
      this.logger.error(
        `Failed to persist gateway result, retrying once: transactionId=${transaction.id} ` +
          `reference=${transaction.reference} gatewayTransactionId=${gatewayResult.gatewayTransactionId} ` +
          `gatewayStatus=${gatewayResult.status}: ${persistError.message}`,
      );
      return this.transactions.updateGatewayResult(transaction.id, input);
    });
  }

  /**
   * The gateway call itself failed (network/timeout/malformed response) —
   * the transaction is marked ERROR and the ORIGINAL gateway error is
   * always what gets returned to the caller, even if persisting the ERROR
   * status also fails (that secondary failure is only logged, never
   * swallows or replaces the real cause of the 502).
   */
  private persistErrorStatus(transaction: Transaction, error: DomainError): AppResultAsync<Transaction> {
    return this.transactions
      .updateGatewayResult(transaction.id, { status: 'ERROR', updatedAt: this.clock.now().toISOString() })
      .andThen(() => errAsync(error))
      .orElse((finalError) => {
        if (finalError !== error) {
          this.logger.error(
            `Failed to persist ERROR status after a gateway failure: transactionId=${transaction.id} ` +
              `reference=${transaction.reference}: ${finalError.message}`,
          );
        }
        return errAsync(error);
      });
  }
}
