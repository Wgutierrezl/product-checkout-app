import { Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { ClockPort } from '../ports/clock.port';
import { NotFoundError, PaymentGatewayError, UnexpectedError } from './domain-error';
import { DomainErrorFilter } from './http-exception.filter';

function createHost(url: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const getResponse = jest.fn().mockReturnValue({ status });
  const getRequest = jest.fn().mockReturnValue({ url });
  const host = {
    switchToHttp: jest.fn().mockReturnValue({ getResponse, getRequest }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('DomainErrorFilter', () => {
  const fixedNow = new Date('2026-09-23T12:00:00.000Z');
  const fakeClock: ClockPort = { now: () => fixedNow };

  it('maps a NotFoundError (4xx) to a 404 response keeping the real domain message', () => {
    const filter = new DomainErrorFilter(fakeClock);
    const { host, status, json } = createHost('/products/missing-id');

    filter.catch(new NotFoundError('Product not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'NotFound',
      message: 'Product not found',
      path: '/products/missing-id',
      timestamp: fixedNow.toISOString(),
    });
  });

  it('maps a PaymentGatewayError (5xx) to 502 with a generic message and logs the real one', () => {
    const filter = new DomainErrorFilter(fakeClock);
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = createHost('/transactions');

    filter.catch(new PaymentGatewayError('Gateway timed out after 5000ms'), host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 502,
        error: 'PaymentGatewayError',
        message: 'Payment provider unavailable',
      }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Gateway timed out after 5000ms'),
      expect.anything(),
    );

    logSpy.mockRestore();
  });

  it('maps an UnexpectedError (5xx) to 500 with a generic message and logs the real one', () => {
    const filter = new DomainErrorFilter(fakeClock);
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = createHost('/anything');

    filter.catch(new UnexpectedError('null pointer somewhere deep'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'Unexpected',
        message: 'Internal server error',
      }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('null pointer somewhere deep'),
      expect.anything(),
    );

    logSpy.mockRestore();
  });

  it('uses the injected ClockPort for the response timestamp instead of the system clock', () => {
    const otherNow = new Date('2026-01-01T00:00:00.000Z');
    const filter = new DomainErrorFilter({ now: () => otherNow });
    const { host, json } = createHost('/health');

    filter.catch(new NotFoundError('missing'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: otherNow.toISOString() }),
    );
  });

  it('defaults to the system clock when no ClockPort is provided', () => {
    const filter = new DomainErrorFilter();
    const { host, json } = createHost('/health');

    filter.catch(new NotFoundError('missing'), host);

    const [payload] = json.mock.calls[0] as [{ timestamp: string }];
    expect(new Date(payload.timestamp).getTime()).not.toBeNaN();
  });
});
