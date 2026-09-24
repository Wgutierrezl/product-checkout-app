import { Module } from '@nestjs/common';

import { SystemClockAdapter } from '../shared/infrastructure/clock/system-clock.adapter';
import { CLOCK_PORT } from '../shared/ports/clock.port';
import { GetPaymentAcceptanceUseCase } from './application/get-payment-acceptance.use-case';
import { PaymentAcceptanceController } from './infrastructure/payment-acceptance.controller';

/**
 * `CLOCK_PORT` is registered locally here (not re-used from `AppModule`'s own
 * provider) because `AppModule` declares it directly on its own `providers`
 * array without `@Global()`/`exports`, so it isn't visible to imported
 * feature modules. A future hardening pass could promote `Clock`/`IdGenerator`
 * into their own `@Global()` module (mirroring `DynamoModule`/
 * `PaymentGatewayModule`) to avoid this local re-registration pattern.
 */
@Module({
  controllers: [PaymentAcceptanceController],
  providers: [
    GetPaymentAcceptanceUseCase,
    { provide: CLOCK_PORT, useClass: SystemClockAdapter },
  ],
})
export class PaymentAcceptanceModule {}
