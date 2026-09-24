import { PaymentGatewayError } from '../../shared/errors/domain-error';
import { ClockPort } from '../../shared/ports/clock.port';
import { errAsync, okAsync } from '../../shared/result/result.types';
import {
  buildAcceptanceTokens,
  FakePaymentGatewayPort,
} from '../../shared/payment-gateway/test/payment-gateway.fixtures';
import { GetPaymentAcceptanceUseCase } from './get-payment-acceptance.use-case';

function buildFakeClock(initialTimeMs: number): ClockPort & { advance: (ms: number) => void } {
  let currentTimeMs = initialTimeMs;
  return {
    now: () => new Date(currentTimeMs),
    advance: (ms: number) => {
      currentTimeMs += ms;
    },
  };
}

describe('GetPaymentAcceptanceUseCase', () => {
  it('returns the acceptance tokens fetched from the gateway', async () => {
    const tokens = buildAcceptanceTokens();
    const useCase = new GetPaymentAcceptanceUseCase(
      new FakePaymentGatewayPort(tokens),
      buildFakeClock(0),
    );

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(tokens);
  });

  it('propagates a PaymentGatewayError when the gateway is unreachable', async () => {
    const error = new PaymentGatewayError('Payment gateway request failed: timeout');
    const failingGateway = { getAcceptanceTokens: () => errAsync(error) } as unknown as ConstructorParameters<
      typeof GetPaymentAcceptanceUseCase
    >[0];
    const useCase = new GetPaymentAcceptanceUseCase(failingGateway, buildFakeClock(0));

    const result = await useCase.execute();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe(error);
  });

  describe('caching', () => {
    it('does not call the gateway again on a second call within the 5-minute TTL', async () => {
      const tokens = buildAcceptanceTokens();
      const fakeGateway = new FakePaymentGatewayPort(tokens);
      const spy = jest.spyOn(fakeGateway, 'getAcceptanceTokens');
      const clock = buildFakeClock(0);
      const useCase = new GetPaymentAcceptanceUseCase(fakeGateway, clock);

      await useCase.execute();
      clock.advance(4 * 60 * 1000);
      const second = await useCase.execute();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(second._unsafeUnwrap()).toEqual(tokens);
    });

    it('calls the gateway again once the 5-minute TTL has elapsed', async () => {
      const tokens = buildAcceptanceTokens();
      const fakeGateway = new FakePaymentGatewayPort(tokens);
      const spy = jest.spyOn(fakeGateway, 'getAcceptanceTokens');
      const clock = buildFakeClock(0);
      const useCase = new GetPaymentAcceptanceUseCase(fakeGateway, clock);

      await useCase.execute();
      clock.advance(5 * 60 * 1000 + 1);
      await useCase.execute();

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed gateway response — retries on the very next call', async () => {
      const error = new PaymentGatewayError('down');
      const tokens = buildAcceptanceTokens();
      const getAcceptanceTokens = jest
        .fn()
        .mockReturnValueOnce(errAsync(error))
        .mockReturnValueOnce(okAsync(tokens));
      const gateway = { getAcceptanceTokens } as unknown as ConstructorParameters<
        typeof GetPaymentAcceptanceUseCase
      >[0];
      const clock = buildFakeClock(0);
      const useCase = new GetPaymentAcceptanceUseCase(gateway, clock);

      const first = await useCase.execute();
      const second = await useCase.execute();

      expect(first.isErr()).toBe(true);
      expect(second.isOk()).toBe(true);
      expect(getAcceptanceTokens).toHaveBeenCalledTimes(2);
    });
  });
});
