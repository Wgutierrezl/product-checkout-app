export const GATEWAY_TRANSACTION_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const;

export type GatewayTransactionStatus = (typeof GATEWAY_TRANSACTION_STATUSES)[number];

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
