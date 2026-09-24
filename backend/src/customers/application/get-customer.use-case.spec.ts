import { buildCustomer, FakeCustomerRepository } from '../test/customer.fixtures';
import { GetCustomerUseCase } from './get-customer.use-case';

describe('GetCustomerUseCase', () => {
  it('returns the customer when it exists', async () => {
    const customer = buildCustomer();
    const useCase = new GetCustomerUseCase(new FakeCustomerRepository([customer]));

    const result = await useCase.execute('cust-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(customer);
  });

  it('returns NotFoundError when the customer does not exist', async () => {
    const useCase = new GetCustomerUseCase(new FakeCustomerRepository([]));

    const result = await useCase.execute('unknown-id');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('NotFound');
  });
});
