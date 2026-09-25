import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
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
 * they don't need to be imported here. `AuthModule` (PR6) is imported for
 * `OptionalJwtAuthGuard`/`TOKEN_PORT`, applied on `POST /transactions` only
 * — guest checkout is completely unaffected. `AuthModule` depends only on
 * config, never on `AccountsModule` or this module, so this is a plain
 * import (no `forwardRef`) — `TransactionsModule` never imports
 * `AccountsModule` directly (that cycle used to exist; `AccountsModule` now
 * reaches this module's `TRANSACTION_REPOSITORY_PORT` one-directionally).
 */
@Module({
  imports: [ProductsModule, CustomersModule, DeliveriesModule, AuthModule],
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
  // Exported so AccountsModule can inject TRANSACTION_REPOSITORY_PORT for
  // ListMyTransactionsUseCase's GET /me/transactions join (PR6).
  exports: [TRANSACTION_REPOSITORY_PORT],
})
export class TransactionsModule {}
