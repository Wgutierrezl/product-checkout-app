import { IdGeneratorPort } from '../../shared/ports/id-generator.port';
import { PasswordHasherPort } from '../domain/ports/password-hasher.port';
import { FakeUserRepository, buildUser } from '../test/user.fixtures';
import { RegisterUseCase } from './register.use-case';

function buildHasher(hashedValue = 'hashed-password'): PasswordHasherPort {
  return {
    hash: jest.fn().mockResolvedValue(hashedValue),
    compare: jest.fn().mockResolvedValue(true),
  };
}

function buildIds(id = 'user-new'): IdGeneratorPort {
  return { newId: () => id, newReference: () => `REF-${id}` };
}

describe('RegisterUseCase', () => {
  it('hashes the password, creates the user, and returns it without the plaintext password', async () => {
    const repository = new FakeUserRepository();
    const hasher = buildHasher('$2a$10$hashedvalue');
    const useCase = new RegisterUseCase(repository, hasher, buildIds('user-new'));

    const result = await useCase.execute({
      fullName: 'Jane Doe',
      email: 'jane.doe@example.com',
      password: 'correct-horse-battery-staple',
    });

    expect(result.isOk()).toBe(true);
    const user = result._unsafeUnwrap();
    expect(user).toEqual({
      id: 'user-new',
      fullName: 'Jane Doe',
      email: 'jane.doe@example.com',
      passwordHash: '$2a$10$hashedvalue',
      preferences: undefined,
    });
    expect(hasher.hash).toHaveBeenCalledWith('correct-horse-battery-staple');
  });

  it('normalizes the email (trim + lowercase) before checking for duplicates and before storing', async () => {
    const repository = new FakeUserRepository();
    const hasher = buildHasher('$2a$10$hashedvalue');
    const useCase = new RegisterUseCase(repository, hasher, buildIds('user-new'));

    const result = await useCase.execute({
      fullName: 'Jane Doe',
      email: '  Foo@Bar.com  ',
      password: 'correct-horse-battery-staple',
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().email).toBe('foo@bar.com');
  });

  it('treats an email differing only by case/whitespace as a duplicate (case-insensitive uniqueness)', async () => {
    const existing = buildUser({ email: 'foo@bar.com' });
    const repository = new FakeUserRepository([existing]);
    const hasher = buildHasher();
    const createSpy = jest.spyOn(repository, 'create');
    const useCase = new RegisterUseCase(repository, hasher, buildIds());

    const result = await useCase.execute({
      fullName: 'Someone Else',
      email: '  FOO@BAR.com  ',
      password: 'correct-horse-battery-staple',
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Conflict');
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('returns ConflictError without hashing or creating when the email is already registered', async () => {
    const existing = buildUser({ email: 'jane.doe@example.com' });
    const repository = new FakeUserRepository([existing]);
    const hasher = buildHasher();
    const createSpy = jest.spyOn(repository, 'create');
    const useCase = new RegisterUseCase(repository, hasher, buildIds());

    const result = await useCase.execute({
      fullName: 'Jane Doe',
      email: 'jane.doe@example.com',
      password: 'correct-horse-battery-staple',
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Conflict');
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('propagates a ValidationError when the constructed User is invalid', async () => {
    const repository = new FakeUserRepository();
    const hasher = buildHasher();
    const useCase = new RegisterUseCase(repository, hasher, buildIds());

    const result = await useCase.execute({
      fullName: '',
      email: 'jane.doe@example.com',
      password: 'correct-horse-battery-staple',
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });
});
