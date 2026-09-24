import { buildDelivery, FakeDeliveryRepository } from '../test/delivery.fixtures';
import { GetDeliveryUseCase } from './get-delivery.use-case';

describe('GetDeliveryUseCase', () => {
  it('returns the delivery when it exists', async () => {
    const delivery = buildDelivery();
    const useCase = new GetDeliveryUseCase(new FakeDeliveryRepository([delivery]));

    const result = await useCase.execute('delivery-1');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(delivery);
  });

  it('returns NotFoundError when the delivery does not exist', async () => {
    const useCase = new GetDeliveryUseCase(new FakeDeliveryRepository([]));

    const result = await useCase.execute('unknown-id');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe('NotFound');
  });
});
