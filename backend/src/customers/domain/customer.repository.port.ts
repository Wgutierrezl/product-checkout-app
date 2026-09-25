import { AppResultAsync } from '../../shared/result/result.types';
import { Customer } from './customer.entity';

export interface CustomerRepositoryPort {
  findById(id: string): AppResultAsync<Customer>;
  /**
   * Looks up a customer by email. Returns `null` (not an error) when no
   * customer exists yet — this is the expected case for the
   * upsert-by-email flow in `create-transaction`, not a failure.
   *
   * At most one customer per email is expected. The `EmailIndex` GSI used
   * to look this up is NOT itself a uniqueness constraint (DynamoDB GSIs
   * never are) — the actual guarantee comes from `create()`'s
   * transactional email-uniqueness guard. If more than one match is ever
   * found (e.g. data imported before that guard existed), the adapter logs
   * a warning and returns the first match rather than failing the lookup.
   */
  findByEmail(email: string): AppResultAsync<Customer | null>;

  /**
   * Persists a brand-new customer, used by `create-transaction`'s
   * upsert-by-email flow after `findByEmail` returns `null`. Enforces
   * at-most-one-customer-per-email at the DB level via a transactional
   * write with a uniqueness guard item — if two requests race on the same
   * email, the loser transparently returns the winner's customer instead of
   * failing or creating a duplicate.
   */
  create(customer: Customer): AppResultAsync<Customer>;
}

export const CUSTOMER_REPOSITORY_PORT = Symbol('CUSTOMER_REPOSITORY_PORT');
