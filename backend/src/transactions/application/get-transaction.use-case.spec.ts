import { NotFoundError } from '../../shared/errors/domain-error';
import { buildTransaction, FakeTransactionRepository } from '../test/transaction.fixtures';
import { GetTransactionUseCase } from './get-transaction.use-case';

describe('GetTransactionUseCase', () => {
  it('returns the transaction when found', async () => {
    const transaction = buildTransaction({ id: 'tx-1' });
    const useCase = new GetTransactionUseCase(new FakeTransactionRepository([transaction]));

    const result = await useCase.execute('tx-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(transaction);
  });

  it('returns NotFoundError for an unknown id', async () => {
    const useCase = new GetTransactionUseCase(new FakeTransactionRepository([]));

    const result = await useCase.execute('missing-id');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });
});
