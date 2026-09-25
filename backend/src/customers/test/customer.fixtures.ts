import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { Customer } from '../domain/customer.entity';
import { CustomerRepositoryPort } from '../domain/customer.repository.port';

/**
 * Shared test fixtures for the customers module's use-case and controller
 * specs. Test-only: never imported from production code.
 */

export function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-1',
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '+573001234567',
    ...overrides,
  };
}

export class FakeCustomerRepository implements CustomerRepositoryPort {
  constructor(private readonly customers: Customer[] = []) {}

  findById(id: string) {
    const found = this.customers.find((customer) => customer.id === id);
    return found ? okAsync(found) : errAsync(new NotFoundError(`Customer ${id} not found`));
  }

  findByEmail(email: string) {
    const found = this.customers.find((customer) => customer.email === email);
    return okAsync(found ?? null);
  }

  create(customer: Customer) {
    this.customers.push(customer);
    return okAsync(customer);
  }
}
