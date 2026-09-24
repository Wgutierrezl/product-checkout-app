import { Inject, Injectable } from '@nestjs/common';

import { AppResultAsync } from '../../shared/result/result.types';
import { Customer } from '../domain/customer.entity';
import { CUSTOMER_REPOSITORY_PORT, CustomerRepositoryPort } from '../domain/customer.repository.port';

@Injectable()
export class GetCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY_PORT) private readonly customers: CustomerRepositoryPort,
  ) {}

  execute(id: string): AppResultAsync<Customer> {
    return this.customers.findById(id);
  }
}
