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
  GATEWAY_TRANSACTION_STATUSES,
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
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

function isGatewayTransactionStatus(value: unknown): value is GatewayTransactionStatus {
  return typeof value === 'string' && (GATEWAY_TRANSACTION_STATUSES as readonly string[]).includes(value);
}

function isGatewayTransactionResponse(value: unknown): value is GatewayTransactionResponse {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false;
  }

  return typeof value.data.id === 'string' && isGatewayTransactionStatus(value.data.status);
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

  private toGatewayResult(response: GatewayTransactionResponse): GatewayTransactionResult {
    return { gatewayTransactionId: response.data.id, status: response.data.status };
  }

  /**
   * `neverthrow`'s `.map()` does NOT catch synchronous throws inside its
   * callback — an unvalidated upstream shape (e.g. a missing nested field)
   * would throw a raw `TypeError` that escapes the ROP chain entirely,
   * bypassing the 502 `PaymentGatewayError` mapping. Every upstream JSON
   * body MUST be validated with a type guard via `.andThen()` (which DOES
   * short-circuit on `err`) before any `.map()` is allowed to destructure it.
   */
  private validate<T>(
    body: unknown,
    guard: (value: unknown) => value is T,
    context: string,
  ): AppResult<T> {
    if (!guard(body)) {
      this.logger.error(`Payment gateway returned a malformed ${context} response`);
      return err(new PaymentGatewayError(`Payment gateway returned a malformed ${context} response`));
    }

    return ok(body);
  }

  private request(url: string, init: RequestInit): AppResultAsync<unknown> {
    return ResultAsync.fromPromise(this.fetchJson(url, init), (error) => {
      const message = (error as Error).message;
      this.logger.error(`Payment gateway request to ${url} failed: ${message}`);
      return new PaymentGatewayError(`Payment gateway request failed: ${message}`);
    });
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (!response.ok) {
        throw new Error(`Payment gateway responded with status ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
