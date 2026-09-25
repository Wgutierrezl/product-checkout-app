import { buildDelivery, FakeDeliveryRepository } from '../../deliveries/test/delivery.fixtures';
import { buildProduct, FakeProductRepository } from '../../products/test/product.fixtures';
import { NotFoundError } from '../../shared/errors/domain-error';
import { errAsync } from '../../shared/result/result.types';
import { buildTransaction, FakeTransactionRepository } from '../../transactions/test/transaction.fixtures';
import { ListMyTransactionsUseCase } from './list-my-transactions.use-case';

function buildUseCase(options: {
  transactions?: FakeTransactionRepository;
  products?: FakeProductRepository;
  deliveries?: FakeDeliveryRepository;
}) {
  return new ListMyTransactionsUseCase(
    options.transactions ?? new FakeTransactionRepository(),
    options.products ?? new FakeProductRepository(),
    options.deliveries ?? new FakeDeliveryRepository(),
  );
}

describe('ListMyTransactionsUseCase', () => {
  it('returns an empty list when the user has no transactions', async () => {
    const useCase = buildUseCase({});

    const result = await useCase.execute('user-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('joins in the product name, amount, status, createdAt, and — for an APPROVED purchase — the full delivery', async () => {
    const transaction = buildTransaction({ id: 'tx-1', userId: 'user-1', productId: 'prod-1', status: 'APPROVED' });
    const product = buildProduct({ id: 'prod-1', name: 'Wireless Headphones' });
    const delivery = buildDelivery({ transactionId: 'tx-1', address: 'Cra 7 # 71-21', status: 'CREATED' });
    const transactions = new FakeTransactionRepository([transaction]);
    const useCase = buildUseCase({
      transactions,
      products: new FakeProductRepository([product]),
      deliveries: new FakeDeliveryRepository([delivery]),
    });

    const result = await useCase.execute('user-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      {
        transactionId: 'tx-1',
        productId: 'prod-1',
        productName: 'Wireless Headphones',
        amount: transaction.totalAmount.valueInCents,
        status: 'APPROVED',
        createdAt: transaction.createdAt,
        delivery: {
          address: 'Cra 7 # 71-21',
          city: delivery.city,
          region: delivery.region,
          postalCode: delivery.postalCode,
          status: 'CREATED',
        },
      },
    ]);
  });

  it('omits delivery for a not-yet-settled (non-APPROVED) transaction', async () => {
    const transaction = buildTransaction({ id: 'tx-1', userId: 'user-1', status: 'PENDING' });
    const transactions = new FakeTransactionRepository([transaction]);
    const useCase = buildUseCase({
      transactions,
      products: new FakeProductRepository([buildProduct({ id: transaction.productId })]),
      deliveries: new FakeDeliveryRepository([]),
    });

    const result = await useCase.execute('user-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0].delivery).toBeUndefined();
  });

  it('falls back to an undefined productName instead of failing the whole list when the product was deleted', async () => {
    const transaction = buildTransaction({ id: 'tx-1', userId: 'user-1', productId: 'deleted-product' });
    const transactions = new FakeTransactionRepository([transaction]);
    const useCase = buildUseCase({ transactions, products: new FakeProductRepository([]) });

    const result = await useCase.execute('user-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()[0]).toMatchObject({ productId: 'deleted-product', productName: undefined });
  });

  it('deduplicates product lookups when several transactions share the same product', async () => {
    const transactions = new FakeTransactionRepository([
      buildTransaction({ id: 'tx-1', userId: 'user-1', productId: 'prod-1', createdAt: '2026-01-03T00:00:00.000Z' }),
      buildTransaction({ id: 'tx-2', userId: 'user-1', productId: 'prod-2', createdAt: '2026-01-02T00:00:00.000Z' }),
      buildTransaction({ id: 'tx-3', userId: 'user-1', productId: 'prod-1', createdAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    const products = new FakeProductRepository([
      buildProduct({ id: 'prod-1', name: 'Wireless Headphones' }),
      buildProduct({ id: 'prod-2', name: 'Mechanical Keyboard' }),
    ]);
    const findByIdSpy = jest.spyOn(products, 'findById');
    const useCase = buildUseCase({ transactions, products });

    const result = await useCase.execute('user-1');

    expect(result.isOk()).toBe(true);
    const items = result._unsafeUnwrap();
    expect(items.map((item) => item.productName)).toEqual(['Wireless Headphones', 'Mechanical Keyboard', 'Wireless Headphones']);
    // 3 transactions, only 2 UNIQUE product ids — findById must be called
    // once per unique id, never once per transaction.
    expect(findByIdSpy).toHaveBeenCalledTimes(2);
    expect(findByIdSpy).toHaveBeenCalledWith('prod-1');
    expect(findByIdSpy).toHaveBeenCalledWith('prod-2');
  });

  it('correctly attaches deliveries to more transactions than the delivery-lookup concurrency limit', async () => {
    const manyTransactions = Array.from({ length: 12 }, (_, i) =>
      buildTransaction({
        id: `tx-${i}`,
        userId: 'user-1',
        status: 'APPROVED',
        createdAt: new Date(2026, 0, i + 1).toISOString(),
      }),
    );
    const manyDeliveries = manyTransactions.map((transaction) =>
      buildDelivery({ transactionId: transaction.id, address: `Address for ${transaction.id}` }),
    );
    const transactions = new FakeTransactionRepository(manyTransactions);
    const useCase = buildUseCase({
      transactions,
      products: new FakeProductRepository([buildProduct({ id: manyTransactions[0].productId })]),
      deliveries: new FakeDeliveryRepository(manyDeliveries),
    });

    const result = await useCase.execute('user-1');

    expect(result.isOk()).toBe(true);
    const items = result._unsafeUnwrap();
    expect(items).toHaveLength(12);
    for (const item of items) {
      expect(item.delivery?.address).toBe(`Address for ${item.transactionId}`);
    }
  });

  it('propagates an UnexpectedError from the transactions repository', async () => {
    const transactions = new FakeTransactionRepository();
    jest.spyOn(transactions, 'findByUserId').mockReturnValueOnce(errAsync(new NotFoundError('boom')));
    const useCase = buildUseCase({ transactions });

    const result = await useCase.execute('user-1');

    expect(result.isErr()).toBe(true);
  });

  it('propagates an error from a delivery lookup instead of silently dropping it', async () => {
    const transaction = buildTransaction({ id: 'tx-1', userId: 'user-1', status: 'APPROVED' });
    const transactions = new FakeTransactionRepository([transaction]);
    const deliveries = new FakeDeliveryRepository();
    jest
      .spyOn(deliveries, 'findByTransactionId')
      .mockReturnValueOnce(errAsync(new NotFoundError('delivery boom')) as ReturnType<typeof deliveries.findByTransactionId>);
    const useCase = buildUseCase({
      transactions,
      products: new FakeProductRepository([buildProduct({ id: transaction.productId })]),
      deliveries,
    });

    const result = await useCase.execute('user-1');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toBe('delivery boom');
  });
});
