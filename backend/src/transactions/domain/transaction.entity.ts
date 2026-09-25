import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { ValidationError } from '../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../shared/result/result.types';
import { isTransactionStatus, TransactionStatus } from './transaction-status.vo';

/**
 * Delivery details captured on the transaction at create time (PR5) so
 * settlement (PR6) can create the `Delivery` record once the transaction is
 * APPROVED, without asking the buyer for the same data twice.
 */
export interface TransactionDeliveryInfo {
  readonly address: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode?: string;
}

export interface Transaction {
  readonly id: string;
  readonly reference: string;
  readonly customerId: string;
  readonly productId: string;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly baseFee: Money;
  readonly deliveryFee: Money;
  readonly totalAmount: Money;
  readonly status: TransactionStatus;
  readonly gatewayTransactionId?: string;
  readonly lastGatewayCheckAt?: string;
  readonly delivery: TransactionDeliveryInfo;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransactionProps {
  id: string;
  reference: string;
  customerId: string;
  productId: string;
  quantity: Quantity;
  unitPrice: Money;
  baseFee: Money;
  deliveryFee: Money;
  totalAmount: Money;
  status: string;
  gatewayTransactionId?: string;
  lastGatewayCheckAt?: string;
  delivery: TransactionDeliveryInfo;
  createdAt: string;
  updatedAt: string;
}

/**
 * Domain factory for `Transaction`. Centralizes the invariants (required
 * fields, `status` restricted to the known `TransactionStatus` union) so
 * every construction path — DynamoDB reads, `create-transaction`'s pending
 * write, `settle-transaction`'s status update, and tests — shares the same
 * validation instead of re-implementing it. Note that `cardToken` is
 * intentionally NOT a field here or anywhere on `Transaction` — it must
 * never be persisted, because it is sensitive payment data.
 */
export const Transaction = {
  create(props: TransactionProps): AppResult<Transaction> {
    const requiredFields: Array<[string, string]> = [
      ['id', props.id],
      ['reference', props.reference],
      ['customerId', props.customerId],
      ['productId', props.productId],
      ['createdAt', props.createdAt],
      ['updatedAt', props.updatedAt],
      ['delivery.address', props.delivery?.address],
      ['delivery.city', props.delivery?.city],
      ['delivery.region', props.delivery?.region],
    ];
    const missing = requiredFields.find(([, value]) => !value);
    if (missing) {
      return err(new ValidationError(`Transaction is missing required field: ${missing[0]}`));
    }

    if (!isTransactionStatus(props.status)) {
      return err(new ValidationError(`Invalid transaction status: ${props.status}`));
    }

    return ok({
      id: props.id,
      reference: props.reference,
      customerId: props.customerId,
      productId: props.productId,
      quantity: props.quantity,
      unitPrice: props.unitPrice,
      baseFee: props.baseFee,
      deliveryFee: props.deliveryFee,
      totalAmount: props.totalAmount,
      status: props.status,
      gatewayTransactionId: props.gatewayTransactionId,
      lastGatewayCheckAt: props.lastGatewayCheckAt,
      delivery: {
        address: props.delivery.address,
        city: props.delivery.city,
        region: props.delivery.region,
        postalCode: props.delivery.postalCode,
      },
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  },
};
