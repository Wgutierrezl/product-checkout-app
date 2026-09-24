import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './health/health.controller';
import { ProductsModule } from './products/products.module';
import type { AppConfig } from './shared/config/configuration';
import { AppConfigModule } from './shared/config/config.module';
import { DynamoModule } from './shared/infrastructure/dynamo/dynamo.module';
import { SystemClockAdapter } from './shared/infrastructure/clock/system-clock.adapter';
import { UuidIdGeneratorAdapter } from './shared/infrastructure/id/uuid-id-generator.adapter';
import { CLOCK_PORT } from './shared/ports/clock.port';
import { ID_GENERATOR_PORT } from './shared/ports/id-generator.port';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const throttle = configService.getOrThrow<AppConfig['throttle']>('throttle');
        return [{ ttl: throttle.ttl * 1000, limit: throttle.limit }];
      },
    }),
    DynamoModule,
    ProductsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: CLOCK_PORT, useClass: SystemClockAdapter },
    { provide: ID_GENERATOR_PORT, useClass: UuidIdGeneratorAdapter },
  ],
})
export class AppModule {}
