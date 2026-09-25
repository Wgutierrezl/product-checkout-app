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
 * Replaces two separate, non-global registrations: `AppModule`'s own
 * `providers` array (visible only to `HealthController`, declared on
 * `AppModule` itself) and a duplicate local registration on
 * `PaymentAcceptanceModule`. Providers registered that way are not visible
 * to other feature modules, which forced each one to re-declare them; this
 * module is now the single global source of truth.
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
