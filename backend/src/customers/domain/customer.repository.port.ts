import { AppResultAsync } from '../../shared/result/result.types';
import { Customer } from './customer.entity';

export interface CustomerRepositoryPort {
  findById(id: string): AppResultAsync<Customer>;
  /**
   * Looks up a customer by email. Returns `null` (not an error) when no
   * customer exists yet — this is the expected case for the future
   * upsert-by-email flow in `create-transaction` (PR5), not a failure.
   */
  findByEmail(email: string): AppResultAsync<Customer | null>;
}

export const CUSTOMER_REPOSITORY_PORT = Symbol('CUSTOMER_REPOSITORY_PORT');
