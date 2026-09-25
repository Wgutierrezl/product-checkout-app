import { User } from './user.entity';

const validProps = {
  id: 'user-1',
  fullName: 'Jane Doe',
  email: 'jane.doe@example.com',
  passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
};

describe('User.create', () => {
  it('creates a User when all required fields are valid', () => {
    const result = User.create(validProps);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ ...validProps, preferences: undefined });
  });

  it.each(['id', 'fullName', 'email', 'passwordHash'] as const)(
    'returns ValidationError when %s is missing',
    (field) => {
      const result = User.create({ ...validProps, [field]: '' });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    },
  );

  it('returns ValidationError when the email has no @ separator', () => {
    const result = User.create({ ...validProps, email: 'not-an-email' });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('accepts and preserves optional preferences', () => {
    const preferences = {
      phone: '+573001234567',
      address: 'Cra 1 # 2-3',
      city: 'Bogota',
      region: 'Cundinamarca',
      postalCode: '110111',
    };

    const result = User.create({ ...validProps, preferences });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().preferences).toEqual(preferences);
  });

  it('never exposes the plaintext password as a field', () => {
    const result = User.create(validProps);

    expect(result.isOk()).toBe(true);
    expect(Object.keys(result._unsafeUnwrap())).not.toContain('password');
  });
});
