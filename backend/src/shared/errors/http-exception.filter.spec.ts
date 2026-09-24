import type { ArgumentsHost } from '@nestjs/common';

import { NotFoundError, PaymentGatewayError } from './domain-error';
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
  const filter = new DomainErrorFilter();

  it('maps a NotFoundError to a 404 response body', () => {
    const { host, status, json } = createHost('/products/missing-id');

    filter.catch(new NotFoundError('Product not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'NotFound',
        message: 'Product not found',
        path: '/products/missing-id',
      }),
    );
  });

  it('maps a PaymentGatewayError to a 502 response body', () => {
    const { host, status, json } = createHost('/transactions');

    filter.catch(new PaymentGatewayError('Gateway timed out'), host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 502,
        error: 'PaymentGatewayError',
        message: 'Gateway timed out',
      }),
    );
  });
});
