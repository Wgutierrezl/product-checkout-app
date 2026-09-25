import {
  createTransaction,
  fetchPaymentAcceptance,
  fetchProducts,
  fetchTransaction,
} from './backendClient';
import { BackendApiError } from './types';
import type { CreateTransactionInput } from './types';

function jsonResponse(body: unknown, init: { ok: boolean; status: number; statusText?: string }) {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? '',
    json: () => Promise.resolve(body),
  } as Response;
}

const API_URL = 'https://api.checkout.test';

describe('backendClient', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('network resilience (shared by every backendClient call)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('throws a BackendApiError with status 0 when the network request itself fails', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(fetchProducts()).rejects.toMatchObject({
        name: 'BackendApiError',
        status: 0,
      });
    });

    it('aborts the request and throws a BackendApiError with status 0 after the timeout', async () => {
      jest.useFakeTimers();
      fetchMock.mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          }),
      );

      const pending = fetchProducts();
      const assertion = expect(pending).rejects.toMatchObject({ status: 0, name: 'BackendApiError' });
      await jest.advanceTimersByTimeAsync(15_000);
      await assertion;
    });

    it('passes an AbortSignal to fetch on every call', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([], { ok: true, status: 200 }));

      await fetchProducts();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('request headers (CORS preflight)', () => {
    function sentHeaderNames(): string[] {
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      return Object.keys(init.headers ?? {}).map((name) => name.toLowerCase());
    }

    it.each([
      ['fetchProducts', () => fetchProducts()],
      ['fetchPaymentAcceptance', () => fetchPaymentAcceptance()],
      ['fetchTransaction', () => fetchTransaction('tx-1')],
    ])('%s sends no Content-Type, so the body-less GET stays a CORS simple request', async (_name, call) => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: true, status: 200 }));

      await call();

      expect(sentHeaderNames()).not.toContain('content-type');
    });

    it('createTransaction sends Content-Type: application/json with its JSON body', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: true, status: 201 }));

      await createTransaction({} as CreateTransactionInput);

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
      expect(typeof init.body).toBe('string');
    });
  });

  describe('fetchProducts', () => {
    it('GETs /products and returns the parsed array', async () => {
      const products = [
        {
          id: 'p1',
          name: 'Headphones',
          description: 'Noise-cancelling',
          price: 150_000,
          currency: 'COP',
          stock: 5,
          imageUrl: 'https://img.test/p1.png',
        },
      ];
      fetchMock.mockResolvedValueOnce(jsonResponse(products, { ok: true, status: 200 }));

      const result = await fetchProducts();

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/products`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(products);
    });

    it('throws BackendApiError with the domain error message on a 5xx response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 500, error: 'Unexpected', message: 'Internal server error' },
          { ok: false, status: 500 },
        ),
      );

      await expect(fetchProducts()).rejects.toMatchObject({
        name: 'BackendApiError',
        status: 500,
        message: 'Internal server error',
      });
    });
  });

  describe('fetchPaymentAcceptance', () => {
    it('GETs /payment-acceptance and returns the parsed tokens', async () => {
      const acceptance = {
        acceptanceToken: 'tok_accept',
        acceptanceTokenPermalink: 'https://gateway.test/terms',
        acceptPersonalAuth: 'tok_auth',
        acceptPersonalAuthPermalink: 'https://gateway.test/auth',
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(acceptance, { ok: true, status: 200 }));

      const result = await fetchPaymentAcceptance();

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/payment-acceptance`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(acceptance);
    });

    it('throws BackendApiError on a 502 gateway-unreachable response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 502, error: 'PaymentGatewayError', message: 'Payment provider unavailable' },
          { ok: false, status: 502 },
        ),
      );

      await expect(fetchPaymentAcceptance()).rejects.toMatchObject({
        status: 502,
        message: 'Payment provider unavailable',
      });
    });
  });

  describe('createTransaction', () => {
    const input: CreateTransactionInput = {
      idempotencyKey: 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
      productId: 'e1a6b6b0-6c9e-4a3a-9c1a-6f6f2b6b1a10',
      quantity: 2,
      customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
      delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
      cardToken: 'tok_test_card',
      installments: 1,
      acceptanceToken: 'tok_accept',
      acceptPersonalAuth: 'tok_auth',
    };

    it('POSTs the exact backend transaction shape to /transactions', async () => {
      const created = {
        id: 't1',
        reference: 'REF-1',
        status: 'PENDING',
        productAmount: 300_000,
        baseFee: 250_000,
        deliveryFee: 800_000,
        total: 1_350_000,
        currency: 'COP',
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(created, { ok: true, status: 201 }));

      const result = await createTransaction(input);

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/transactions`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
        }),
      );
      expect(result).toEqual(created);
    });

    it('throws BackendApiError with a joined message on a 400 field-validation response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 400, error: 'Bad Request', message: ['quantity must not be greater than 10', 'email must be an email'] },
          { ok: false, status: 400 },
        ),
      );

      await expect(createTransaction(input)).rejects.toMatchObject({
        status: 400,
        message: 'quantity must not be greater than 10; email must be an email',
      });
    });

    it('throws BackendApiError with status 409 on insufficient stock', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 409, error: 'InsufficientStock', message: 'Insufficient stock' },
          { ok: false, status: 409 },
        ),
      );

      await expect(createTransaction(input)).rejects.toMatchObject({ status: 409 });
    });

    it('falls back to statusText when the error body has no usable message', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 503, statusText: 'Service Unavailable' }));

      await expect(createTransaction(input)).rejects.toMatchObject({
        status: 503,
        message: 'Service Unavailable',
      });
    });

    it('falls back to a generic message when there is neither a usable message nor a statusText', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500, statusText: '' }));

      await expect(createTransaction(input)).rejects.toMatchObject({
        status: 500,
        message: 'Unexpected backend error',
      });
    });

    it('falls back to statusText when the message array contains non-string items', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 400, message: ['ok', 42] },
          { ok: false, status: 400, statusText: 'Bad Request' },
        ),
      );

      await expect(createTransaction(input)).rejects.toMatchObject({
        status: 400,
        message: 'Bad Request',
      });
    });

    it('falls back to statusText when the error response body is not valid JSON', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new Error('not json')),
      } as Response);

      await expect(createTransaction(input)).rejects.toMatchObject({
        status: 502,
        message: 'Bad Gateway',
      });
    });
  });

  describe('fetchTransaction', () => {
    it('GETs /transactions/:id and returns the parsed transaction', async () => {
      const transaction = {
        id: 't1',
        reference: 'REF-1',
        status: 'APPROVED',
        productAmount: 300_000,
        baseFee: 250_000,
        deliveryFee: 800_000,
        total: 1_350_000,
        currency: 'COP',
        delivery: {
          id: 'd1',
          transactionId: 't1',
          address: 'Cra ***',
          city: 'Bogota',
          region: 'Cundinamarca',
          status: 'CREATED',
          createdAt: '2026-09-23T00:00:00.000Z',
        },
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(transaction, { ok: true, status: 200 }));

      const result = await fetchTransaction('t1');

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/transactions/t1`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(transaction);
    });

    it('throws BackendApiError with status 404 when the transaction is not found', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ statusCode: 404, error: 'NotFound', message: 'Transaction not found' }, { ok: false, status: 404 }),
      );

      await expect(fetchTransaction('missing')).rejects.toBeInstanceOf(BackendApiError);
    });

    it('aborts the underlying fetch when an external signal is aborted (e.g. polling was cancelled)', async () => {
      const externalController = new AbortController();
      let capturedInternalSignal: AbortSignal | undefined;
      fetchMock.mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            capturedInternalSignal = init?.signal ?? undefined;
            init?.signal?.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          }),
      );

      const pending = fetchTransaction('t1', { signal: externalController.signal });
      const assertion = expect(pending).rejects.toMatchObject({ status: 0, name: 'BackendApiError' });
      externalController.abort();
      await assertion;
      expect(capturedInternalSignal?.aborted).toBe(true);
    });
  });
});
