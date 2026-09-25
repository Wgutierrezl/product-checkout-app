import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
import { User, UserPreferences } from '../domain/user.entity';
import { UserRepositoryPort } from '../domain/user.repository.port';

/**
 * Shared test fixtures for the accounts module's use-case and controller
 * specs. Test-only: never imported from production code.
 */

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
    ...overrides,
  };
}

export class FakeUserRepository implements UserRepositoryPort {
  constructor(private readonly users: User[] = []) {}

  findById(id: string) {
    const found = this.users.find((user) => user.id === id);
    return found ? okAsync(found) : errAsync(new NotFoundError(`User ${id} not found`));
  }

  findByEmail(email: string) {
    const found = this.users.find((user) => user.email === email);
    return okAsync(found ?? null);
  }

  create(user: User) {
    this.users.push(user);
    return okAsync(user);
  }

  updatePreferences(userId: string, preferences: UserPreferences) {
    const index = this.users.findIndex((user) => user.id === userId);
    if (index === -1) {
      return errAsync(new NotFoundError(`User ${userId} not found`));
    }

    const updated: User = { ...this.users[index], preferences };
    this.users[index] = updated;
    return okAsync(updated);
  }
}
