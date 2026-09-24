import { Customer } from './customer.entity';

const validProps = {
  id: 'cust-1',
  fullName: 'Jane Doe',
  email: 'jane.doe@example.com',
  phone: '+573001234567',
};

describe('Customer.create', () => {
  it('creates a Customer when all fields are valid', () => {
    const result = Customer.create(validProps);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(validProps);
  });

  it.each(['id', 'fullName', 'email', 'phone'] as const)(
    'returns ValidationError when %s is missing',
    (field) => {
      const result = Customer.create({ ...validProps, [field]: '' });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    },
  );

  it('returns ValidationError when the email has no @ separator', () => {
    const result = Customer.create({ ...validProps, email: 'not-an-email' });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('returns ValidationError when the phone has letters', () => {
    const result = Customer.create({ ...validProps, phone: '+57abc1234567' });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('returns ValidationError when the phone is shorter than 7 digits', () => {
    const result = Customer.create({ ...validProps, phone: '123456' });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('returns ValidationError when the phone is longer than 15 digits', () => {
    const result = Customer.create({ ...validProps, phone: '1234567890123456' });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });

  it('accepts a phone without a leading +', () => {
    const result = Customer.create({ ...validProps, phone: '3001234567' });

    expect(result.isOk()).toBe(true);
  });
});
