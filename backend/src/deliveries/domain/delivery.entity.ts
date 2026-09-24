/**
 * Only 'CREATED' exists today — a Delivery is created once, atomically, as
 * part of transaction settlement (see design.md TransactWriteItems). No other
 * status transition is specified yet.
 */
export type DeliveryStatus = 'CREATED';

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
