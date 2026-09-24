import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResultAsync } from 'neverthrow';

import type { AppConfig } from '../../config/configuration';
import { PaymentGatewayError } from '../../errors/domain-error';
import { AppResultAsync } from '../../result/result.types';
import { PaymentGatewayPort } from '../domain/payment-gateway.port';
import {
  AcceptanceTokens,
  CreateCardTransactionInput,
  GatewayTransactionResult,
  GatewayTransactionStatus,
} from '../domain/payment-gateway.types';

interface MerchantAcceptanceResponse {
  data: {
    presigned_acceptance: { acceptance_token: string; permalink: string };
    presigned_personal_data_auth: { acceptance_token: string; permalink: string };
  };
}

interface GatewayTransactionResponse {
  data: {
    id: string;
    status: GatewayTransactionStatus;
  };
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
    return this.request<MerchantAcceptanceResponse>(
      `${this.config.url}/merchants/${this.config.publicKey}`,
      { method: 'GET' },
    ).map((response) => ({
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
    return this.request<GatewayTransactionResponse>(`${this.config.url}/transactions`, {
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
    }).map((response) => this.toGatewayResult(response));
  }

  getTransaction(gatewayTransactionId: string): AppResultAsync<GatewayTransactionResult> {
    return this.request<GatewayTransactionResponse>(
      `${this.config.url}/transactions/${gatewayTransactionId}`,
      { method: 'GET', headers: { Authorization: `Bearer ${this.config.privateKey}` } },
    ).map((response) => this.toGatewayResult(response));
  }

  private toGatewayResult(response: GatewayTransactionResponse): GatewayTransactionResult {
    return { gatewayTransactionId: response.data.id, status: response.data.status };
  }

  private request<T>(url: string, init: RequestInit): AppResultAsync<T> {
    return ResultAsync.fromPromise(this.fetchJson<T>(url, init), (error) => {
      const message = (error as Error).message;
      this.logger.error(`Payment gateway request to ${url} failed: ${message}`);
      return new PaymentGatewayError(`Payment gateway request failed: ${message}`);
    });
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (!response.ok) {
        throw new Error(`Payment gateway responded with status ${response.status}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
