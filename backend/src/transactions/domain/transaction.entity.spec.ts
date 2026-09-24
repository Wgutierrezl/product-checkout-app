import { Money } from '../../products/domain/value-objects/money.vo';
import { Quantity } from '../../products/domain/value-objects/quantity.vo';
import { Transaction, TransactionProps } from './transaction.entity';

function validProps(overrides: Partial<TransactionProps> = {}): TransactionProps {
  return {
    id: 'tx-1',
    reference: 'REF-abc123',
    customerId: 'cust-1',
    productId: 'prod-1',
    quantity: Quantity.create(2)._unsafeUnwrap(),
    unitPrice: Money.create(150_000)._unsafeUnwrap(),
    baseFee: Money.create(250_000)._unsafeUnwrap(),
    deliveryFee: Money.create(800_000)._unsafeUnwrap(),
    totalAmount: Money.create(1_350_000)._unsafeUnwrap(),
    status: 'PENDING',
    delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('Transaction.create', () => {
  it('builds a Transaction from valid props', () => {
    const result = Transaction.create(validProps());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      id: 'tx-1',
      reference: 'REF-abc123',
      status: 'PENDING',
    });
  });

  it('accepts an optional postalCode on delivery', () => {
    const result = Transaction.create(
      validProps({ delivery: { address: 'Cra 1', city: 'Bogota', region: 'Cundinamarca', postalCode: '110111' } }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().delivery.postalCode).toBe('110111');
  });

  it('accepts an optional gatewayTransactionId and lastGatewayCheckAt', () => {
    const result = Transaction.create(
      validProps({ gatewayTransactionId: 'gw-1', lastGatewayCheckAt: '2026-09-23T00:05:00.000Z' }),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().gatewayTransactionId).toBe('gw-1');
  });

  it.each(['id', 'reference', 'customerId', 'productId', 'createdAt', 'updatedAt'] as const)(
    'rejects a missing required field: %s',
    (field) => {
      const result = Transaction.create(validProps({ [field]: '' }));

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    },
  );

  it.each(['address', 'city', 'region'] as const)(
    'rejects a missing required delivery field: %s',
    (field) => {
      const delivery = { ...validProps().delivery, [field]: '' };
      const result = Transaction.create(validProps({ delivery }));

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('Validation');
    },
  );

  it('rejects an invalid status', () => {
    const result = Transaction.create(validProps({ status: 'REFUNDED' }));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain('Invalid transaction status');
  });
});
