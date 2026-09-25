import { FakeUserRepository, buildUser } from '../test/user.fixtures';
import { UpdatePreferencesUseCase } from './update-preferences.use-case';

describe('UpdatePreferencesUseCase', () => {
  it('persists the preferences and returns the updated user', async () => {
    const user = buildUser({ id: 'user-1' });
    const repository = new FakeUserRepository([user]);
    const useCase = new UpdatePreferencesUseCase(repository);
    const preferences = {
      phone: '+573001234567',
      address: 'Cra 1 # 2-3',
      city: 'Bogota',
      region: 'Cundinamarca',
      postalCode: '110111',
    };

    const result = await useCase.execute({ userId: 'user-1', preferences });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().preferences).toEqual(preferences);
  });

  it('propagates a NotFoundError when the JWT subject no longer resolves to a user', async () => {
    const repository = new FakeUserRepository([]);
    const useCase = new UpdatePreferencesUseCase(repository);

    const result = await useCase.execute({
      userId: 'deleted-user',
      preferences: { phone: '+573001234567', address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('NotFound');
  });
});
