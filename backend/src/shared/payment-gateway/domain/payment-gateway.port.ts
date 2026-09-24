import { AppResultAsync } from '../../result/result.types';
import {
  AcceptanceTokens,
  CreateCardTransactionInput,
  GatewayTransactionResult,
} from './payment-gateway.types';

/**
 * Generic port for the payment gateway — no vendor-specific naming anywhere
 * in this interface. `HttpPaymentGatewayAdapter` is the only file allowed to
 * know the concrete vendor's URL shape/field names.
 */
export interface PaymentGatewayPort {
  /** `GET /merchants/{public_key}` — acceptance + personal-data-auth tokens. */
  getAcceptanceTokens(): AppResultAsync<AcceptanceTokens>;

  /** `POST /transactions` (CARD) — used by the transactions module (PR5). */
  createCardTransaction(
    input: CreateCardTransactionInput,
  ): AppResultAsync<GatewayTransactionResult>;

  /** `GET /transactions/{gatewayTransactionId}` — used for lazy-poll (PR6). */
  getTransaction(gatewayTransactionId: string): AppResultAsync<GatewayTransactionResult>;
}

export const PAYMENT_GATEWAY_PORT = Symbol('PAYMENT_GATEWAY_PORT');
