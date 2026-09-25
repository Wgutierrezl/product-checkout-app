import { PasswordHasherPort } from '../domain/ports/password-hasher.port';
import { TokenPort } from '../domain/ports/token.port';
import { FakeUserRepository, buildUser } from '../test/user.fixtures';
import { LoginUseCase } from './login.use-case';

function buildHasher(matches: boolean): PasswordHasherPort {
  return {
    hash: jest.fn().mockResolvedValue('unused'),
    compare: jest.fn().mockResolvedValue(matches),
  };
}

function buildTokens(token = 'signed.jwt.token'): TokenPort {
  return {
    issue: jest.fn().mockReturnValue(token),
    verify: jest.fn(),
  };
}

describe('LoginUseCase', () => {
  it('returns an access token and the user when credentials match', async () => {
    const user = buildUser({ id: 'user-1', email: 'jane.doe@example.com' });
    const repository = new FakeUserRepository([user]);
    const hasher = buildHasher(true);
    const tokens = buildTokens('signed.jwt.token');
    const useCase = new LoginUseCase(repository, hasher, tokens);

    const result = await useCase.execute({
      email: 'jane.doe@example.com',
      password: 'correct-horse-battery-staple',
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ accessToken: 'signed.jwt.token', user });
    expect(hasher.compare).toHaveBeenCalledWith('correct-horse-battery-staple', user.passwordHash);
    expect(tokens.issue).toHaveBeenCalledWith({ sub: 'user-1', email: 'jane.doe@example.com' });
  });

  it('returns UnauthorizedError without leaking whether the email exists when the email is unknown', async () => {
    const repository = new FakeUserRepository([]);
    const hasher = buildHasher(true);
    const tokens = buildTokens();
    const useCase = new LoginUseCase(repository, hasher, tokens);

    const result = await useCase.execute({ email: 'unknown@example.com', password: 'whatever' });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Unauthorized');
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('finds the user regardless of email case/whitespace on login (case-insensitive lookup)', async () => {
    const user = buildUser({ id: 'user-1', email: 'foo@bar.com' });
    const repository = new FakeUserRepository([user]);
    const hasher = buildHasher(true);
    const tokens = buildTokens('signed.jwt.token');
    const useCase = new LoginUseCase(repository, hasher, tokens);

    const result = await useCase.execute({
      email: '  Foo@Bar.com  ',
      password: 'correct-horse-battery-staple',
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().user).toEqual(user);
  });

  it('runs a dummy bcrypt.compare against a static hash on the not-found path (timing-safe against enumeration)', async () => {
    const repository = new FakeUserRepository([]);
    const hasher = buildHasher(true);
    const tokens = buildTokens();
    const useCase = new LoginUseCase(repository, hasher, tokens);

    const result = await useCase.execute({ email: 'unknown@example.com', password: 'whatever' });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Unauthorized');
    // Same shape of work as the real credential-check path: one bcrypt
    // compare call, against SOME hash string, regardless of whether the
    // email exists — response time no longer betrays that distinction.
    expect(hasher.compare).toHaveBeenCalledTimes(1);
    expect(hasher.compare).toHaveBeenCalledWith('whatever', expect.any(String));
  });

  it('returns UnauthorizedError when the password does not match', async () => {
    const user = buildUser({ email: 'jane.doe@example.com' });
    const repository = new FakeUserRepository([user]);
    const hasher = buildHasher(false);
    const tokens = buildTokens();
    const useCase = new LoginUseCase(repository, hasher, tokens);

    const result = await useCase.execute({
      email: 'jane.doe@example.com',
      password: 'wrong-password',
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Unauthorized');
    expect(tokens.issue).not.toHaveBeenCalled();
  });
});
