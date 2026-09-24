export const GATEWAY_TRANSACTION_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const;

export type GatewayTransactionStatus = (typeof GATEWAY_TRANSACTION_STATUSES)[number];

/**
 * Shared runtime shape guards for untrusted upstream JSON (gateway HTTP
 * responses, webhook payloads). Centralized here — not duplicated per
 * adapter/parser file — so every consumer agrees on what counts as "a
 * record" or "a known gateway status".
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isGatewayTransactionStatus(value: unknown): value is GatewayTransactionStatus {
  return typeof value === 'string' && (GATEWAY_TRANSACTION_STATUSES as readonly string[]).includes(value);
}

export interface AcceptanceTokenInfo {
  token: string;
  permalink: string;
}

/**
 * Both tokens (and their permalinks, which the frontend must link to so the
 * buyer can read the accepted terms/personal-data-auth policy) are required
 * fields on `POST /transactions`.
 */
export interface AcceptanceTokens {
  acceptanceToken: AcceptanceTokenInfo;
  acceptPersonalAuth: AcceptanceTokenInfo;
}

export interface CreateCardTransactionInput {
  amountInCents: number;
  currency: 'COP';
  customerEmail: string;
  reference: string;
  acceptanceToken: string;
  acceptPersonalAuth: string;
  signature: string;
  cardToken: string;
  installments: number;
}

export interface GatewayTransactionResult {
  gatewayTransactionId: string;
  status: GatewayTransactionStatus;
}
