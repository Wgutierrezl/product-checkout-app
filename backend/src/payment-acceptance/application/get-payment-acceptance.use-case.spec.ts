import { PaymentGatewayError } from '../../shared/errors/domain-error';
import { errAsync, okAsync } from '../../shared/result/result.types';
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

  it('fetches fresh tokens on every call — never reuses a previous response', async () => {
    const first = buildAcceptanceTokens({
      acceptanceToken: { token: 'first-token', permalink: 'https://gateway.test/1' },
    });
    const second = buildAcceptanceTokens({
      acceptanceToken: { token: 'second-token', permalink: 'https://gateway.test/2' },
    });
    // Acceptance tokens are single-use (confirmed live against the sandbox):
    // a second call MUST hit the gateway again and MUST return whatever it
    // issues this time, never a stale cached pair.
    const getAcceptanceTokens = jest.fn().mockReturnValueOnce(okAsync(first)).mockReturnValueOnce(okAsync(second));
    const gateway = { getAcceptanceTokens } as unknown as ConstructorParameters<
      typeof GetPaymentAcceptanceUseCase
    >[0];
    const useCase = new GetPaymentAcceptanceUseCase(gateway);

    const firstResult = await useCase.execute();
    const secondResult = await useCase.execute();

    expect(getAcceptanceTokens).toHaveBeenCalledTimes(2);
    expect(firstResult._unsafeUnwrap()).toEqual(first);
    expect(secondResult._unsafeUnwrap()).toEqual(second);
  });
});
