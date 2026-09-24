import { PaymentGatewayError } from '../../shared/errors/domain-error';
import { errAsync } from '../../shared/result/result.types';
import {
  buildAcceptanceTokens,
  FakePaymentGatewayPort,
} from '../../shared/payment-gateway/test/payment-gateway.fixtures';
import { GetPaymentAcceptanceUseCase } from './get-payment-acceptance.use-case';

describe('GetPaymentAcceptanceUseCase', () => {
  it('returns the acceptance tokens fetched from the gateway', async () => {
    const tokens = buildAcceptanceTokens();
    const useCase = new GetPaymentAcceptanceUseCase(new FakePaymentGatewayPort(tokens));

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(tokens);
  });

  it('propagates a PaymentGatewayError when the gateway is unreachable', async () => {
    const error = new PaymentGatewayError('Payment gateway request failed: timeout');
    const failingGateway = { getAcceptanceTokens: () => errAsync(error) } as unknown as ConstructorParameters<
      typeof GetPaymentAcceptanceUseCase
    >[0];
    const useCase = new GetPaymentAcceptanceUseCase(failingGateway);

    const result = await useCase.execute();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe(error);
  });
});
