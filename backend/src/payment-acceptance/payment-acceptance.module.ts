import { Module } from '@nestjs/common';

import { GetPaymentAcceptanceUseCase } from './application/get-payment-acceptance.use-case';
import { PaymentAcceptanceController } from './infrastructure/payment-acceptance.controller';

/**
 * `CLOCK_PORT` is provided globally by `SharedKernelModule` (see batch 5) —
 * no local registration needed here anymore.
 */
@Module({
  controllers: [PaymentAcceptanceController],
  providers: [GetPaymentAcceptanceUseCase],
})
export class PaymentAcceptanceModule {}
