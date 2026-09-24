import { Inject, Injectable } from '@nestjs/common';

import {
  PAYMENT_GATEWAY_PORT,
  PaymentGatewayPort,
} from '../../shared/payment-gateway/domain/payment-gateway.port';
import { AcceptanceTokens } from '../../shared/payment-gateway/domain/payment-gateway.types';
import { AppResultAsync } from '../../shared/result/result.types';

@Injectable()
export class GetPaymentAcceptanceUseCase {
  constructor(@Inject(PAYMENT_GATEWAY_PORT) private readonly gateway: PaymentGatewayPort) {}

  execute(): AppResultAsync<AcceptanceTokens> {
    return this.gateway.getAcceptanceTokens();
  }
}
