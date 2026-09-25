import { ValidationError } from '../../shared/errors/domain-error';
import { AppResult, err, ok } from '../../shared/result/result.types';

/**
 * Only 'CREATED' exists today — a Delivery is created once, atomically, as
 * part of transaction settlement (the same DynamoDB `TransactWriteItems`
 * that approves the transaction and decrements stock). No other
 * status transition is specified yet.
 */
export const DELIVERY_STATUSES = ['CREATED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

function isDeliveryStatus(value: string): value is DeliveryStatus {
  return (DELIVERY_STATUSES as readonly string[]).includes(value);
}

export interface Delivery {
  readonly id: string;
  readonly transactionId: string;
  readonly customerId: string;
  readonly address: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode?: string;
  readonly status: DeliveryStatus;
  readonly createdAt: string;
}

export interface DeliveryProps {
  id: string;
  transactionId: string;
  customerId: string;
  address: string;
  city: string;
  region: string;
  postalCode?: string;
  status: string;
  createdAt: string;
}

/**
 * Domain factory for `Delivery`. Centralizes the invariants (required
 * fields, `status` restricted to the known `DeliveryStatus` union) so every
 * construction path — DynamoDB reads, PR6's settlement write, and tests —
 * shares the same validation instead of re-implementing it.
 */
export const Delivery = {
  create(props: DeliveryProps): AppResult<Delivery> {
    const requiredFields: Array<[string, string]> = [
      ['id', props.id],
      ['transactionId', props.transactionId],
      ['customerId', props.customerId],
      ['address', props.address],
      ['city', props.city],
      ['region', props.region],
      ['createdAt', props.createdAt],
    ];
    const missing = requiredFields.find(([, value]) => !value);
    if (missing) {
      return err(new ValidationError(`Delivery is missing required field: ${missing[0]}`));
    }

    if (!isDeliveryStatus(props.status)) {
      return err(new ValidationError(`Invalid delivery status: ${props.status}`));
    }

    return ok({
      id: props.id,
      transactionId: props.transactionId,
      customerId: props.customerId,
      address: props.address,
      city: props.city,
      region: props.region,
      postalCode: props.postalCode,
      status: props.status,
      createdAt: props.createdAt,
    });
  },
};
