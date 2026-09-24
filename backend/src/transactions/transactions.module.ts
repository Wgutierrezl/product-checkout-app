import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CustomersModule } from '../customers/customers.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { ProductsModule } from '../products/products.module';
import type { AppConfig } from '../shared/config/configuration';
import { CreateTransactionUseCase, FEES_CONFIG, INTEGRITY_SECRET } from './application/create-transaction.use-case';
import { EVENTS_SECRET, HandleWebhookUseCase } from './application/handle-webhook.use-case';
import { GetTransactionUseCase, LAZY_POLL_THRESHOLD_MS, RECONCILIATION_WINDOW_MS } from './application/get-transaction.use-case';
import { SettleTransactionUseCase } from './application/settle-transaction.use-case';
import { TRANSACTION_REPOSITORY_PORT } from './domain/transaction.repository.port';
import { DynamoTransactionRepository } from './infrastructure/dynamo-transaction.repository';
import { TransactionsController } from './infrastructure/transactions.controller';

/**
 * `PRODUCT_REPOSITORY_PORT`/`CUSTOMER_REPOSITORY_PORT`/`DELIVERY_REPOSITORY_PORT`
 * come from importing ProductsModule/CustomersModule/DeliveriesModule (all
 * three export their port token). `DYNAMO_DOCUMENT_CLIENT`/
 * `PAYMENT_GATEWAY_PORT`/`CLOCK_PORT`/`ID_GENERATOR_PORT` are all global
 * (DynamoModule/PaymentGatewayModule/SharedKernelModule on AppModule), so
 * they don't need to be imported here.
 */
@Module({
  imports: [ProductsModule, CustomersModule, DeliveriesModule],
  controllers: [TransactionsController],
  providers: [
    CreateTransactionUseCase,
    GetTransactionUseCase,
    SettleTransactionUseCase,
    HandleWebhookUseCase,
    { provide: TRANSACTION_REPOSITORY_PORT, useClass: DynamoTransactionRepository },
    {
      provide: FEES_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.getOrThrow<AppConfig['fees']>('fees'),
    },
    {
      provide: INTEGRITY_SECRET,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow<AppConfig['paymentGateway']>('paymentGateway').integritySecret,
    },
    {
      provide: EVENTS_SECRET,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow<AppConfig['paymentGateway']>('paymentGateway').eventsSecret,
    },
    {
      provide: LAZY_POLL_THRESHOLD_MS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.getOrThrow<number>('lazyPollThresholdMs'),
    },
    {
      provide: RECONCILIATION_WINDOW_MS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.getOrThrow<number>('reconciliationWindowMs'),
    },
  ],
})
export class TransactionsModule {}
