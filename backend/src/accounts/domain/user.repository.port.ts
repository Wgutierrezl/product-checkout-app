import { AppResultAsync } from '../../shared/result/result.types';
import { User } from './user.entity';

export interface UserRepositoryPort {
  findById(id: string): AppResultAsync<User>;

  /**
   * Looks up a user by email. Returns `null` (not an error) when no user
   * exists yet — this is the expected case for `RegisterUseCase`'s
   * duplicate-email check, not a failure.
   *
   * At most one user per email is expected. The `EmailIndex` GSI used to
   * look this up is NOT itself a uniqueness constraint (DynamoDB GSIs never
   * are) — the actual guarantee comes from `create()`'s transactional
   * email-uniqueness guard.
   */
  findByEmail(email: string): AppResultAsync<User | null>;

  /**
   * Persists a brand-new user, enforcing at-most-one-user-per-email at the
   * DB level via a transactional write with a uniqueness guard item.
   *
   * Unlike `CustomerRepositoryPort.create` (an anonymous upsert-by-email
   * flow, where returning the existing customer on a race is the desired
   * behavior), a registration race here MUST fail with a `ConflictError` —
   * silently returning a different account than the one the caller thinks
   * they just created would be a correctness/security bug for auth.
   */
  create(user: User): AppResultAsync<User>;
}

export const USER_REPOSITORY_PORT = Symbol('USER_REPOSITORY_PORT');
