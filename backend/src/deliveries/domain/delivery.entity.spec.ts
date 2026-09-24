import { Delivery } from './delivery.entity';

const validProps = {
  id: 'delivery-1',
  transactionId: 'txn-1',
  customerId: 'cust-1',
  address: 'Cra 7 # 71-21',
  city: 'Bogotá',
  region: 'Cundinamarca',
  postalCode: '110231',
  status: 'CREATED',
  createdAt: '2026-09-23T00:00:00.000Z',
};

describe('Delivery.create', () => {
  it('creates a Delivery when all fields are valid', () => {
    const result = Delivery.create(validProps);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(validProps);
  });

  it('creates a Delivery when the optional postalCode is omitted', () => {
    const { postalCode: _postalCode, ...propsWithoutPostalCode } = validProps;
    const result = Delivery.create(propsWithoutPostalCode);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().postalCode).toBeUndefined();
  });

  it.each(['id', 'transactionId', 'customerId', 'address', 'city', 'region', 'createdAt'] as const)(
    'returns ValidationError when %s is missing',
    (field) => {
      const result = Delivery.create({ ...validProps, [field]: '' });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    },
  );

  it('returns ValidationError when the status is not a known DeliveryStatus', () => {
    const result = Delivery.create({ ...validProps, status: 'SHIPPED' });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('Validation');
  });
});
