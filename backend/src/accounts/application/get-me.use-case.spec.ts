import { FakeUserRepository, buildUser } from '../test/user.fixtures';
import { GetMeUseCase } from './get-me.use-case';

describe('GetMeUseCase', () => {
  it('returns the user for a known id', async () => {
    const user = buildUser({ id: 'user-1', preferences: { phone: '+573001234567' } });
    const repository = new FakeUserRepository([user]);
    const useCase = new GetMeUseCase(repository);

    const result = await useCase.execute('user-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(user);
  });

  it('propagates a NotFoundError when the JWT subject no longer resolves to a user', async () => {
    const repository = new FakeUserRepository([]);
    const useCase = new GetMeUseCase(repository);

    const result = await useCase.execute('deleted-user');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('NotFound');
  });
});
