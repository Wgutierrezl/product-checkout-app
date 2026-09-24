import { Global, Module } from '@nestjs/common';

import { PAYMENT_GATEWAY_PORT } from './domain/payment-gateway.port';
import { HttpPaymentGatewayAdapter } from './infrastructure/http-payment-gateway.adapter';

/**
 * Global module so `PAYMENT_GATEWAY_PORT` is injectable from any feature
 * module (payment-acceptance today; transactions in PR5/PR6) without each
 * of them re-declaring or re-importing the provider — mirrors `DynamoModule`.
 */
@Global()
@Module({
  providers: [{ provide: PAYMENT_GATEWAY_PORT, useClass: HttpPaymentGatewayAdapter }],
  exports: [PAYMENT_GATEWAY_PORT],
})
export class PaymentGatewayModule {}
