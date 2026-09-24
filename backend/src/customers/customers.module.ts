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
  exports: [CUSTOMER_REPOSITORY_PORT],
})
export class CustomersModule {}
