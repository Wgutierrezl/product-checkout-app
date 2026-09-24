import { Inject, Injectable } from '@nestjs/common';

import {
  PAYMENT_GATEWAY_PORT,
  PaymentGatewayPort,
} from '../../shared/payment-gateway/domain/payment-gateway.port';
import { AcceptanceTokens } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { AppResultAsync } from '../../shared/result/result.types';

/**
 * Deliberately NOT cached. A live sandbox smoke test confirmed the payment
 * gateway's presigned acceptance tokens are single-use: replaying a token on
 * a second `POST /transactions` is rejected by the gateway as "already
 * used". Caching this response (as a previous revision did, for a 5-minute
 * TTL) would silently hand out a stale, already-consumed token to any
 * checkout attempt within that window, surfacing as a misleading gateway
 * failure. Every call fetches a fresh pair; the global throttler still
 * protects this endpoint from abuse.
 */
@Injectable()
export class GetPaymentAcceptanceUseCase {
  constructor(@Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort) {}

  execute(): AppResultAsync<AcceptanceTokens> {
    return this.gateway.getAcceptanceTokens();
  }
}
