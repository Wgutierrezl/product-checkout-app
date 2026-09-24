import { Module } from '@nestjs/common';

import { GetCustomerUseCase } from './application/get-customer.use-case';
import { CUSTOMER_REPOSITORY_PORT } from './domain/customer.repository.port';
import { DynamoCustomerRepository } from './infrastructure/dynamo-customer.repository';
import { CustomersController } from './infrastructure/customers.controller';

@Module({
  controllers: [CustomersController],
  providers: [
    GetCustomerUseCase,
    { provide: CUSTOMER_REPOSITORY_PORT, useClass: DynamoCustomerRepository },
  ],
  // Exported so PR5's TransactionsModule can inject CUSTOMER_REPOSITORY_PORT for the create-transaction upsert-by-email flow.
  exports: [CUSTOMER_REPOSITORY_PORT],
})
export class CustomersModule {}
