/**
 * Wire-format types for the checkout backend. These mirror the backend's
 * response/request DTOs exactly (field names, casing, units) so the API
 * adapters below stay a thin, honest boundary — no reshaping happens here.
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  /** Unit price, in integer cents. */
  price: number;
  currency: 'COP';
  stock: number;
  imageUrl: string;
}

export interface CustomerInput {
  fullName: string;
  email: string;
  phone: string;
}

export interface DeliveryInput {
  address: string;
  city: string;
  region: string;
  postalCode?: string;
}

export type TransactionStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR';

/**
 * Delivery as embedded in a transaction response. `address` is
 * SERVER-MASKED (only the first characters are visible) — the UI must
 * source the buyer's unmasked address from local state, never from here.
 */
export interface TransactionDelivery {
  id: string;
  transactionId: string;
  address: string;
  city: string;
  region: string;
  postalCode?: string;
  status: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  reference: string;
  status: TransactionStatus;
  /** Unit price x quantity, in integer cents. */
  productAmount: number;
  baseFee: number;
  deliveryFee: number;
  total: number;
  currency: 'COP';
  /** Present only once the transaction is APPROVED. */
  delivery?: TransactionDelivery;
}

export interface CreateTransactionInput {
  idempotencyKey: string;
  productId: string;
  quantity: number;
  customer: CustomerInput;
  delivery: DeliveryInput;
  cardToken: string;
  installments: number;
  acceptanceToken: string;
  acceptPersonalAuth: string;
}

export interface PaymentAcceptance {
  acceptanceToken: string;
  acceptanceTokenPermalink: string;
  acceptPersonalAuth: string;
  acceptPersonalAuthPermalink: string;
}

/**
 * Raised for any non-2xx backend response. `status` is the HTTP status
 * code; `message` is the best-effort human-readable reason extracted from
 * either error shape the backend can return (see `backendClient.ts`).
 */
/**
 * Status given to a request this app aborted after its own client-side
 * timeout (HTTP's 408 Request Timeout, which carries the same meaning).
 * Unlike a network failure, the request may well have reached the backend,
 * so callers must treat its outcome as unknown.
 */
export const REQUEST_TIMEOUT_STATUS = 408;

export class BackendApiError extends Error {
  /**
   * @param errorType the backend's `error` field (e.g. `PaymentGatewayError`)
   *   when the body carried one; `undefined` for network failures or bodies
   *   that did not come from the backend's own error filter (e.g. a proxy).
   */
  constructor(
    message: string,
    readonly status: number,
    readonly errorType?: string,
  ) {
    super(message);
    this.name = 'BackendApiError';
  }
}

export interface TokenizeCardInput {
  number: string;
  cvc: string;
  expMonth: string;
  expYear: string;
  cardHolder: string;
}

export interface TokenizeCardResult {
  cardToken: string;
}

/** Raised when the payment gateway rejects or fails to tokenize a card. */
export class GatewayTokenizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayTokenizeError';
  }
}
