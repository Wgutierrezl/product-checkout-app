import { Global, Module } from '@nestjs/common';

import { SystemClockAdapter } from '../infrastructure/clock/system-clock.adapter';
import { UuidIdGeneratorAdapter } from '../infrastructure/id/uuid-id-generator.adapter';
import { CLOCK_PORT } from '../ports/clock.port';
import { ID_GENERATOR_PORT } from '../ports/id-generator.port';

/**
 * Global module so `CLOCK_PORT`/`ID_GENERATOR_PORT` are injectable from any
 * feature module without each of them re-declaring the provider — mirrors
 * `DynamoModule`/`PaymentGatewayModule`.
 *
 * Promoted here (batch 5) from two separate, non-global registrations:
 * `AppModule`'s own `providers` array (visible only to `HealthController`,
 * declared on `AppModule` itself) and a duplicate local registration on
 * `PaymentAcceptanceModule`. Both are now removed in favor of this single
 * global source of truth — see `sdd/backend-core/apply-progress` batch 4b's
 * deviation note for the discovery that motivated this module.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK_PORT, useClass: SystemClockAdapter },
    { provide: ID_GENERATOR_PORT, useClass: UuidIdGeneratorAdapter },
  ],
  exports: [CLOCK_PORT, ID_GENERATOR_PORT],
})
export class SharedKernelModule {}
