import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AccountsModule } from './accounts/accounts.module';
import { CustomersModule } from './customers/customers.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { HealthController } from './health/health.controller';
import { PaymentAcceptanceModule } from './payment-acceptance/payment-acceptance.module';
import { ProductsModule } from './products/products.module';
import { TransactionsModule } from './transactions/transactions.module';
import type { AppConfig } from './shared/config/configuration';
import { AppConfigModule } from './shared/config/config.module';
import { DynamoModule } from './shared/infrastructure/dynamo/dynamo.module';
import { SharedKernelModule } from './shared/kernel/shared-kernel.module';
import { PaymentGatewayModule } from './shared/payment-gateway/payment-gateway.module';

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
    SharedKernelModule,
    DynamoModule,
    PaymentGatewayModule,
    ProductsModule,
    CustomersModule,
    DeliveriesModule,
    PaymentAcceptanceModule,
    TransactionsModule,
    AccountsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
