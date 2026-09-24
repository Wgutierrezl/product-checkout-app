import { Inject, Injectable } from '@nestjs/common';

import { Customer } from '../../customers/domain/customer.entity';
import { CUSTOMER_REPOSITORY_PORT, CustomerRepositoryPort } from '../../customers/domain/customer.repository.port';
import { Product } from '../../products/domain/product.entity';
import { PRODUCT_REPOSITORY_PORT, ProductRepositoryPort } from '../../products/domain/product.repository.port';
import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { InsufficientStockError } from '../../shared/errors/domain-error';
import { buildIntegritySignature } from '../../shared/payment-gateway/domain/integrity-signature';
import { PAYMENT_GATEWAY_PORT, PaymentGatewayPort } from '../../shared/payment-gateway/domain/payment-gateway.port';
import { CLOCK_PORT, ClockPort } from '../../shared/ports/clock.port';
import { ID_GENERATOR_PORT, IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { AppResult, AppResultAsync, err, errAsync, ok, okAsync } from '../../shared/result/result.types';
import { Transaction, TransactionDeliveryInfo } from '../domain/transaction.entity';
import { TRANSACTION_REPOSITORY_PORT, TransactionRepositoryPort } from '../domain/transaction.repository.port';

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
      .andThen((transaction) => this.chargeGateway(transaction, command));
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

  private persistPending(state: PendingState): AppResultAsync<Transaction> {
    return this.transactions.createPending({
      id: this.ids.newId(),
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
      .andThen((gatewayResult) =>
        this.transactions.updateGatewayResult(transaction.id, {
          gatewayTransactionId: gatewayResult.gatewayTransactionId,
          status: gatewayResult.status,
          updatedAt: this.clock.now().toISOString(),
        }),
      )
      .orElse((error) =>
        this.transactions
          .updateGatewayResult(transaction.id, { status: 'ERROR', updatedAt: this.clock.now().toISOString() })
          .andThen(() => errAsync(error)),
      );
  }
}
