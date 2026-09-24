import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResultAsync } from 'neverthrow';

import type { AppConfig } from '../../config/configuration';
import { PaymentGatewayError } from '../../errors/domain-error';
import { AppResult, AppResultAsync, err, ok } from '../../result/result.types';
import { PaymentGatewayPort } from '../domain/payment-gateway.port';
import {
  AcceptanceTokens,
  CreateCardTransactionInput,
  GatewayTransactionResult,
  GatewayTransactionStatus,
  isGatewayTransactionStatus,
  isRecord,
} from '../domain/payment-gateway.types';

interface AcceptanceTokenInfoShape {
  acceptance_token: string;
  permalink: string;
}

interface MerchantAcceptanceResponse {
  data: {
    presigned_acceptance: AcceptanceTokenInfoShape;
    presigned_personal_data_auth: AcceptanceTokenInfoShape;
  };
}

interface GatewayTransactionResponse {
  data: {
    id: string;
    status: GatewayTransactionStatus;
    amount_in_cents?: number;
    currency?: string;
  };
}

interface GatewayTransactionListResponse {
  data: Array<{ id: string; status: GatewayTransactionStatus }>;
}

/**
 * Thrown by `fetchJson` for a non-2xx HTTP response, carrying whether the
 * status is a DEFINITE client-side rejection (4xx — the gateway explicitly
 * rejected the request before processing it) or an AMBIGUOUS one (5xx — the
 * gateway may have processed the request before failing to respond
 * correctly). Any other thrown error (network failure, timeout/abort) has no
 * HTTP status at all and is always treated as ambiguous — see `request()`.
 */
class GatewayHttpStatusError extends Error {
  constructor(
    message: string,
    readonly ambiguous: boolean,
  ) {
    super(message);
  }
}

function isAcceptanceTokenInfoShape(value: unknown): value is AcceptanceTokenInfoShape {
  return (
    isRecord(value) &&
    typeof value.acceptance_token === 'string' &&
    typeof value.permalink === 'string'
  );
}

function isMerchantAcceptanceResponse(value: unknown): value is MerchantAcceptanceResponse {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false;
  }

  return (
    isAcceptanceTokenInfoShape(value.data.presigned_acceptance) &&
    isAcceptanceTokenInfoShape(value.data.presigned_personal_data_auth)
  );
}

function isGatewayTransactionResponse(value: unknown): value is GatewayTransactionResponse {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false;
  }
  const { id, status, amount_in_cents: amountInCents, currency } = value.data;

  if (typeof id !== 'string' || !isGatewayTransactionStatus(status)) {
    return false;
  }
  if (amountInCents !== undefined && typeof amountInCents !== 'number') {
    return false;
  }
  if (currency !== undefined && typeof currency !== 'string') {
    return false;
  }
  return true;
}

function isGatewayTransactionListItem(value: unknown): value is { id: string; status: GatewayTransactionStatus } {
  return isRecord(value) && typeof value.id === 'string' && isGatewayTransactionStatus(value.status);
}

function isGatewayTransactionListResponse(value: unknown): value is GatewayTransactionListResponse {
  return isRecord(value) && Array.isArray(value.data) && value.data.every(isGatewayTransactionListItem);
}

/**
 * The only file in the codebase allowed to know the payment gateway's
 * concrete HTTP shape (endpoint paths, field names). Everything above the
 * `PaymentGatewayPort` interface stays vendor-agnostic.
 */
@Injectable()
export class HttpPaymentGatewayAdapter implements PaymentGatewayPort {
  private readonly logger = new Logger(HttpPaymentGatewayAdapter.name);
  private readonly config: AppConfig['paymentGateway'];

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<AppConfig['paymentGateway']>('paymentGateway');
  }

  getAcceptanceTokens(): AppResultAsync<AcceptanceTokens> {
    return this.request(`${this.config.url}/merchants/${this.config.publicKey}`, {
      method: 'GET',
    })
      .andThen((body) => this.validate(body, isMerchantAcceptanceResponse, 'acceptance tokens'))
      .map((response) => ({
        acceptanceToken: {
          token: response.data.presigned_acceptance.acceptance_token,
          permalink: response.data.presigned_acceptance.permalink,
        },
        acceptPersonalAuth: {
          token: response.data.presigned_personal_data_auth.acceptance_token,
          permalink: response.data.presigned_personal_data_auth.permalink,
        },
      }));
  }

  createCardTransaction(
    input: CreateCardTransactionInput,
  ): AppResultAsync<GatewayTransactionResult> {
    return this.request(`${this.config.url}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.privateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount_in_cents: input.amountInCents,
        currency: input.currency,
        customer_email: input.customerEmail,
        reference: input.reference,
        acceptance_token: input.acceptanceToken,
        accept_personal_auth: input.acceptPersonalAuth,
        signature: input.signature,
        payment_method: {
          type: 'CARD',
          token: input.cardToken,
          installments: input.installments,
        },
      }),
    })
      .andThen((body) => this.validate(body, isGatewayTransactionResponse, 'transaction'))
      .map((response) => this.toGatewayResult(response));
  }

  getTransaction(gatewayTransactionId: string): AppResultAsync<GatewayTransactionResult> {
    return this.request(`${this.config.url}/transactions/${gatewayTransactionId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.config.privateKey}` },
    })
      .andThen((body) => this.validate(body, isGatewayTransactionResponse, 'transaction'))
      .map((response) => this.toGatewayResult(response));
  }

  /**
   * `GET /transactions?reference={reference}` — live-confirmed against the
   * sandbox to return `{ data: [...], meta: {} }`, an ARRAY (empty when no
   * transaction matches that reference yet). Used for lazy-poll when a
   * PENDING transaction has no `gatewayTransactionId` (see
   * `PaymentGatewayPort.getTransactionByReference`).
   */
  getTransactionByReference(reference: string): AppResultAsync<GatewayTransactionResult | null> {
    return this.request(
      `${this.config.url}/transactions?reference=${encodeURIComponent(reference)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${this.config.privateKey}` } },
    )
      .andThen((body) => this.validate(body, isGatewayTransactionListResponse, 'transaction list'))
      .map((response) => {
        if (response.data.length > 1) {
          this.logger.warn(
            `Gateway returned multiple transactions for one reference lookup (reference=${reference}), ` +
              'expected at most one. Using the first match.',
          );
        }
        return response.data.length > 0 ? this.toGatewayResult({ data: response.data[0] }) : null;
      });
  }

  private toGatewayResult(response: GatewayTransactionResponse): GatewayTransactionResult {
    return {
      gatewayTransactionId: response.data.id,
      status: response.data.status,
      amountInCents: response.data.amount_in_cents,
      currency: response.data.currency,
    };
  }

  /**
   * `neverthrow`'s `.map()` does NOT catch synchronous throws inside its
   * callback — an unvalidated upstream shape (e.g. a missing nested field)
   * would throw a raw `TypeError` that escapes the ROP chain entirely,
   * bypassing the 502 `PaymentGatewayError` mapping. Every upstream JSON
   * body MUST be validated with a type guard via `.andThen()` (which DOES
   * short-circuit on `err`) before any `.map()` is allowed to destructure it.
   */
  /**
   * A malformed body arriving after an otherwise-successful (2xx) HTTP
   * response is always AMBIGUOUS: the gateway responded, which suggests it
   * did process the request, we just couldn't parse its confirmation.
   */
  private validate<T>(
    body: unknown,
    guard: (value: unknown) => value is T,
    context: string,
  ): AppResult<T> {
    if (!guard(body)) {
      this.logger.error(`Payment gateway returned a malformed ${context} response`);
      return err(new PaymentGatewayError(`Payment gateway returned a malformed ${context} response`, true));
    }

    return ok(body);
  }

  private request(url: string, init: RequestInit): AppResultAsync<unknown> {
    return ResultAsync.fromPromise(this.fetchJson(url, init), (error) => {
      const message = (error as Error).message;
      this.logger.error(`Payment gateway request to ${url} failed: ${message}`);
      // A `GatewayHttpStatusError` carries its own classification (4xx =
      // definite, 5xx = ambiguous). Anything else (network failure, abort/
      // timeout) has no HTTP status to reason about at all — always
      // ambiguous, since we genuinely don't know if the gateway received it.
      const ambiguous = error instanceof GatewayHttpStatusError ? error.ambiguous : true;
      return new PaymentGatewayError(`Payment gateway request failed: ${message}`, ambiguous);
    });
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (!response.ok) {
        const isDefiniteRejection = response.status >= 400 && response.status < 500;
        throw new GatewayHttpStatusError(
          `Payment gateway responded with status ${response.status}`,
          !isDefiniteRejection,
        );
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
