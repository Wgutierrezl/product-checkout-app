import { TokenPort } from '../../auth/domain/ports/token.port';
import { PasswordHasherPort } from '../domain/ports/password-hasher.port';
import { FakeUserRepository } from '../test/user.fixtures';
import { LoginUseCase } from './login.use-case';
import { RegisterUseCase } from './register.use-case';

/**
 * Dedicated cross-use-case regression test for the email-case bug: register
 * and login must agree on email normalization end to end, sharing the SAME
 * repository (in-memory here; DynamoUserRepository in production), not just
 * pass in isolation against mocked collaborators.
 */
function buildRealisticHasher(): PasswordHasherPort {
  return {
    hash: async (plain) => `hashed:${plain}`,
    compare: async (plain, hash) => hash === `hashed:${plain}`,
  };
}

function buildTokens(): TokenPort {
  return { issue: () => 'signed.jwt.token', verify: jest.fn() };
}

describe('Register -> Login email case-insensitivity (cross-use-case)', () => {
  it('registers with mixed-case email, then logs in with lowercase — succeeds', async () => {
    const repository = new FakeUserRepository();
    const hasher = buildRealisticHasher();
    const registerUseCase = new RegisterUseCase(repository, hasher, {
      newId: () => 'user-1',
      newReference: () => 'REF-user-1',
    });
    const loginUseCase = new LoginUseCase(repository, hasher, buildTokens());

    const registerResult = await registerUseCase.execute({
      fullName: 'Jane Doe',
      email: 'Foo@Bar.com',
      password: 'correct-horse-battery-staple',
    });
    expect(registerResult.isOk()).toBe(true);
    expect(registerResult._unsafeUnwrap().email).toBe('foo@bar.com');

    const loginResult = await loginUseCase.execute({
      email: 'foo@bar.com',
      password: 'correct-horse-battery-staple',
    });

    expect(loginResult.isOk()).toBe(true);
    expect(loginResult._unsafeUnwrap().user.id).toBe('user-1');
  });

  it('registers with lowercase email, then logs in with mixed-case — succeeds', async () => {
    const repository = new FakeUserRepository();
    const hasher = buildRealisticHasher();
    const registerUseCase = new RegisterUseCase(repository, hasher, {
      newId: () => 'user-2',
      newReference: () => 'REF-user-2',
    });
    const loginUseCase = new LoginUseCase(repository, hasher, buildTokens());

    await registerUseCase.execute({
      fullName: 'John Doe',
      email: 'john.doe@example.com',
      password: 'correct-horse-battery-staple',
    });

    const loginResult = await loginUseCase.execute({
      email: '  John.Doe@Example.com  ',
      password: 'correct-horse-battery-staple',
    });

    expect(loginResult.isOk()).toBe(true);
    expect(loginResult._unsafeUnwrap().user.id).toBe('user-2');
  });

  it('rejects a second registration that differs only by case as a duplicate (409-equivalent Conflict)', async () => {
    const repository = new FakeUserRepository();
    const hasher = buildRealisticHasher();
    const registerUseCase = new RegisterUseCase(repository, hasher, {
      newId: () => 'user-3',
      newReference: () => 'REF-user-3',
    });

    const first = await registerUseCase.execute({
      fullName: 'Jane Doe',
      email: 'jane.doe@example.com',
      password: 'correct-horse-battery-staple',
    });
    expect(first.isOk()).toBe(true);

    const second = await registerUseCase.execute({
      fullName: 'Jane Doe Impersonator',
      email: 'Jane.Doe@Example.com',
      password: 'a-different-password',
    });

    expect(second.isErr()).toBe(true);
    expect(second._unsafeUnwrapErr().type).toBe('Conflict');
  });
});
