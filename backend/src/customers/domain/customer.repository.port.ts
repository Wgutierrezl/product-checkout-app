import { AppResultAsync } from '../../shared/result/result.types';
import { Customer } from './customer.entity';

export interface CustomerRepositoryPort {
  findById(id: string): AppResultAsync<Customer>;
  /**
   * Looks up a customer by email. Returns `null` (not an error) when no
   * customer exists yet — this is the expected case for the future
   * upsert-by-email flow in `create-transaction` (PR5), not a failure.
   *
   * Assumes at most one customer per email (enforced by the `EmailIndex`
   * GSI's intended usage, not by a DB-level uniqueness constraint). If more
   * than one match is ever found, the adapter logs a warning and returns the
   * first match rather than failing the lookup.
   */
  findByEmail(email: string): AppResultAsync<Customer | null>;
}

export const CUSTOMER_REPOSITORY_PORT = Symbol('CUSTOMER_REPOSITORY_PORT');
