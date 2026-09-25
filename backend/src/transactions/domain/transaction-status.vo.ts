/**
 * The 5 statuses a transaction can hold, mirroring the payment gateway's own
 * `GatewayTransactionStatus` union (see `payment-gateway.types.ts`). Kept as
 * a separate domain-level type (not a re-export) so the transactions module
 * never depends on `shared/payment-gateway` for its own invariants.
 */
export const TRANSACTION_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export function isTransactionStatus(value: string): value is TransactionStatus {
  return (TRANSACTION_STATUSES as readonly string[]).includes(value);
}
