import type { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration';
import { PaymentGatewayError } from '../../errors/domain-error';
import { HttpPaymentGatewayAdapter } from './http-payment-gateway.adapter';

const CONFIG: AppConfig['paymentGateway'] = {
  url: 'https://api-sandbox.payment-gateway.test/v1',
  publicKey: 'pub_test_fake',
  privateKey: 'prv_test_fake',
  integritySecret: 'integrity_test_fake',
  eventsSecret: 'events_test_fake',
  timeoutMs: 50,
};

function buildAdapter(config: Partial<AppConfig['paymentGateway']> = {}): HttpPaymentGatewayAdapter {
  const configService = {
    getOrThrow: () => ({ ...CONFIG, ...config }),
  } as unknown as ConfigService;

  return new HttpPaymentGatewayAdapter(configService);
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('HttpPaymentGatewayAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('getAcceptanceTokens', () => {
    it('maps presigned_acceptance/presigned_personal_data_auth into tokens + permalinks', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse({
          data: {
            presigned_acceptance: {
              acceptance_token: 'acc-token-1',
              permalink: 'https://gateway.test/acceptance',
            },
            presigned_personal_data_auth: {
              acceptance_token: 'auth-token-1',
              permalink: 'https://gateway.test/personal-data-auth',
            },
          },
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getAcceptanceTokens();

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        acceptanceToken: { token: 'acc-token-1', permalink: 'https://gateway.test/acceptance' },
        acceptPersonalAuth: {
          token: 'auth-token-1',
          permalink: 'https://gateway.test/personal-data-auth',
        },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api-sandbox.payment-gateway.test/v1/merchants/pub_test_fake',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('maps a non-2xx HTTP response to PaymentGatewayError', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, false, 401)) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getAcceptanceTokens();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps a network error to PaymentGatewayError', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getAcceptanceTokens();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('aborts and maps to PaymentGatewayError when the gateway does not respond within the timeout', async () => {
      global.fetch = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      }) as unknown as typeof fetch;
      const adapter = buildAdapter({ timeoutMs: 10 });

      const result = await adapter.getAcceptanceTokens();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps a response missing data.presigned_acceptance to PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ data: { presigned_personal_data_auth: { acceptance_token: 'x', permalink: 'y' } } }),
        ) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getAcceptanceTokens();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps a response with no data envelope at all to PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getAcceptanceTokens();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps a non-JSON response body to PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token in JSON')),
      }) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getAcceptanceTokens();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });
  });

  describe('createCardTransaction', () => {
    const input = {
      amountInCents: 1_000_000,
      currency: 'COP' as const,
      customerEmail: 'buyer@example.com',
      reference: 'ref-1',
      acceptanceToken: 'acc-token',
      acceptPersonalAuth: 'auth-token',
      signature: 'sig-hash',
      cardToken: 'card-tok-1',
      installments: 1,
    };

    it('posts to /transactions with a Bearer private key and maps the created transaction', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(jsonResponse({ data: { id: 'gw-tx-1', status: 'PENDING' } }));
      global.fetch = fetchMock as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.createCardTransaction(input);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ gatewayTransactionId: 'gw-tx-1', status: 'PENDING' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-sandbox.payment-gateway.test/v1/transactions');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer prv_test_fake' });
      expect(JSON.parse(init.body as string)).toEqual({
        amount_in_cents: 1_000_000,
        currency: 'COP',
        customer_email: 'buyer@example.com',
        reference: 'ref-1',
        acceptance_token: 'acc-token',
        accept_personal_auth: 'auth-token',
        signature: 'sig-hash',
        payment_method: { type: 'CARD', token: 'card-tok-1', installments: 1 },
      });
    });

    it('maps a gateway-declined synchronous response to a DECLINED status result (still Ok)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ data: { id: 'gw-tx-2', status: 'DECLINED' } })) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.createCardTransaction(input);

      expect(result._unsafeUnwrap()).toEqual({ gatewayTransactionId: 'gw-tx-2', status: 'DECLINED' });
    });

    it('maps a 4xx HTTP failure to a DEFINITE (non-ambiguous) PaymentGatewayError', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, false, 422)) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.createCardTransaction(input);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe('PaymentGatewayError');
      expect((error as PaymentGatewayError).ambiguous).toBe(false);
    });

    it('maps a 5xx HTTP failure to an AMBIGUOUS PaymentGatewayError (the request may have been processed)', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, false, 502)) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.createCardTransaction(input);

      expect(result.isErr()).toBe(true);
      expect((result._unsafeUnwrapErr() as PaymentGatewayError).ambiguous).toBe(true);
    });

    it('maps a network error to an AMBIGUOUS PaymentGatewayError', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.createCardTransaction(input);

      expect((result._unsafeUnwrapErr() as PaymentGatewayError).ambiguous).toBe(true);
    });

    it('maps a timeout/abort to an AMBIGUOUS PaymentGatewayError', async () => {
      global.fetch = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      }) as unknown as typeof fetch;
      const adapter = buildAdapter({ timeoutMs: 10 });

      const result = await adapter.createCardTransaction(input);

      expect((result._unsafeUnwrapErr() as PaymentGatewayError).ambiguous).toBe(true);
    });

    it('maps a response with no data envelope at all (malformed 2xx body) to an AMBIGUOUS PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.createCardTransaction(input);

      expect(result.isErr()).toBe(true);
      expect((result._unsafeUnwrapErr() as PaymentGatewayError).ambiguous).toBe(true);
    });

    it('maps a response missing data.id/status to PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ data: {} })) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.createCardTransaction(input);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps an unknown gateway transaction status to PaymentGatewayError', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ data: { id: 'gw-tx-3', status: 'SOME_FUTURE_STATUS' } })) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.createCardTransaction(input);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });
  });

  describe('getTransaction', () => {
    it('gets /transactions/:id with a Bearer private key and maps the status', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(jsonResponse({ data: { id: 'gw-tx-1', status: 'APPROVED' } }));
      global.fetch = fetchMock as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransaction('gw-tx-1');

      expect(result._unsafeUnwrap()).toEqual({ gatewayTransactionId: 'gw-tx-1', status: 'APPROVED' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-sandbox.payment-gateway.test/v1/transactions/gw-tx-1');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer prv_test_fake' });
    });

    it('also maps amount_in_cents/currency when the upstream body includes them', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ data: { id: 'gw-tx-1', status: 'APPROVED', amount_in_cents: 16_040_000, currency: 'COP' } }),
        ) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransaction('gw-tx-1');

      expect(result._unsafeUnwrap()).toEqual({
        gatewayTransactionId: 'gw-tx-1',
        status: 'APPROVED',
        amountInCents: 16_040_000,
        currency: 'COP',
      });
    });

    it('maps a response with a wrong-typed amount_in_cents to PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ data: { id: 'gw-tx-1', status: 'APPROVED', amount_in_cents: 'not-a-number' } }),
        ) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransaction('gw-tx-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps a response with a wrong-typed currency to PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ data: { id: 'gw-tx-1', status: 'APPROVED', currency: 123 } }),
        ) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransaction('gw-tx-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps an HTTP failure to PaymentGatewayError', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, false, 404)) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransaction('unknown-id');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps a response missing data.id/status to PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ data: { id: 'gw-tx-1' } })) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransaction('gw-tx-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps an unknown gateway transaction status to PaymentGatewayError', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ data: { id: 'gw-tx-1', status: 'MADE_UP' } })) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransaction('gw-tx-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });
  });

  describe('getTransactionByReference', () => {
    it('queries ?reference= with a Bearer private key and maps the first match', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(jsonResponse({ data: [{ id: 'gw-tx-1', status: 'APPROVED' }], meta: {} }));
      global.fetch = fetchMock as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransactionByReference('REF-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ gatewayTransactionId: 'gw-tx-1', status: 'APPROVED' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-sandbox.payment-gateway.test/v1/transactions?reference=REF-1');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer prv_test_fake' });
    });

    it('returns null (not an error) when data is an empty array', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: [], meta: {} })) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransactionByReference('REF-unknown');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('logs a warning and uses the first match when the gateway returns more than one transaction for one reference', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ data: [{ id: 'gw-tx-1', status: 'APPROVED' }, { id: 'gw-tx-2', status: 'PENDING' }], meta: {} }),
        ) as unknown as typeof fetch;
      const warnSpy = jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation();
      const adapter = buildAdapter();

      const result = await adapter.getTransactionByReference('REF-1');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({ gatewayTransactionId: 'gw-tx-1', status: 'APPROVED' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('REF-1'));
      warnSpy.mockRestore();
    });

    it('maps an HTTP failure to PaymentGatewayError', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, false, 500)) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransactionByReference('REF-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps a response with a malformed data shape to PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'gw-tx-1' }] })) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransactionByReference('REF-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });

    it('maps a response with data missing entirely to PaymentGatewayError (does not throw)', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({})) as unknown as typeof fetch;
      const adapter = buildAdapter();

      const result = await adapter.getTransactionByReference('REF-1');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('PaymentGatewayError');
    });
  });
});
