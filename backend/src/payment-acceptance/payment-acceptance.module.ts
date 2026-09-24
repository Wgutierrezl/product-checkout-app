import { Module } from '@nestjs/common';

import { GetPaymentAcceptanceUseCase } from './application/get-payment-acceptance.use-case';
import { PaymentAcceptanceController } from './infrastructure/payment-acceptance.controller';

@Module({
  controllers: [PaymentAcceptanceController],
  providers: [GetPaymentAcceptanceUseCase],
})
export class PaymentAcceptanceModule {}
