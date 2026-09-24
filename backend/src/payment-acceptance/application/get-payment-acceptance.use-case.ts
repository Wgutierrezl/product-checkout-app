import { Inject, Injectable } from '@nestjs/common';

import { CLOCK_PORT, ClockPort } from '../../shared/ports/clock.port';
import {
  PAYMENT_GATEWAY_PORT,
  PaymentGatewayPort,
} from '../../shared/payment-gateway/domain/payment-gateway.port';
import { AcceptanceTokens } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { AppResultAsync, okAsync } from '../../shared/result/result.types';

/** Acceptance tokens/permalinks change rarely; a short cache avoids hitting
 * the gateway on every checkout page load. */
export const ACCEPTANCE_TOKENS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedAcceptanceTokens {
  tokens: AcceptanceTokens;
  fetchedAtMs: number;
}

@Injectable()
export class GetPaymentAcceptanceUseCase {
  private cached: CachedAcceptanceTokens | null = null;

  constructor(
    @Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  execute(): AppResultAsync<AcceptanceTokens> {
    if (this.cached && this.isFresh(this.cached)) {
      return okAsync(this.cached.tokens);
    }

    return this.gateway.getAcceptanceTokens().map((tokens) => {
      this.cached = { tokens, fetchedAtMs: this.clock.now().getTime() };
      return tokens;
    });
  }

  private isFresh(cached: CachedAcceptanceTokens): boolean {
    return this.clock.now().getTime() - cached.fetchedAtMs < ACCEPTANCE_TOKENS_CACHE_TTL_MS;
  }
}
