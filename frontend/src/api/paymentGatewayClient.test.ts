import { tokenizeCard } from './paymentGatewayClient';
import { GatewayTokenizeError } from './types';
import type { TokenizeCardInput } from './types';

function jsonResponse(body: unknown, init: { ok: boolean; status: number }) {
  return {
    ok: init.ok,
    status: init.status,
    json: () => Promise.resolve(body),
  } as Response;
}

const GATEWAY_URL = 'https://gateway.checkout.test';
const PUBLIC_KEY = 'pub_test_0000000000';

describe('paymentGatewayClient', () => {
  let fetchMock: jest.Mock;

  const input: TokenizeCardInput = {
    number: '4111111111111111',
    cvc: '123',
    expMonth: '09',
    expYear: '2030',
    cardHolder: 'Jane Doe',
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('POSTs to /tokens/cards with only the public key, never the private key', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { id: 'tok_test_card', status: 'CREATED' } }, { ok: true, status: 201 }),
    );

    const result = await tokenizeCard(input);

    expect(fetchMock).toHaveBeenCalledWith(
      `${GATEWAY_URL}/tokens/cards`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${PUBLIC_KEY}` }),
        body: JSON.stringify({
          number: input.number,
          cvc: input.cvc,
          exp_month: input.expMonth,
          exp_year: input.expYear,
          card_holder: input.cardHolder,
        }),
      }),
    );
    expect(result).toEqual({ cardToken: 'tok_test_card' });
  });

  it('throws GatewayTokenizeError when the gateway rejects the card (4xx)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { messages: { number: ['is invalid'] } } }, { ok: false, status: 422 }),
    );

    await expect(tokenizeCard(input)).rejects.toBeInstanceOf(GatewayTokenizeError);
  });

  it('surfaces the gateway-provided field messages when the gateway rejects the card', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { type: 'INVALID_REQUEST_ERROR', messages: { number: ['is invalid'], cvc: ['is too short'] } } },
        { ok: false, status: 422 },
      ),
    );

    await expect(tokenizeCard(input)).rejects.toMatchObject({
      message: 'number: is invalid; cvc: is too short',
    });
  });

  it('ignores non-array or non-string message entries while still using the valid ones', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { messages: { number: ['is invalid', 42], cvc: 'not an array' } } },
        { ok: false, status: 422 },
      ),
    );

    await expect(tokenizeCard(input)).rejects.toMatchObject({ message: 'number: is invalid' });
  });

  it('falls back to the reason when messages is present but yields no usable entries', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { messages: {}, reason: 'invalid card token' } }, { ok: false, status: 422 }),
    );

    await expect(tokenizeCard(input)).rejects.toMatchObject({ message: 'invalid card token' });
  });

  it('surfaces the gateway-provided reason when there are no field messages', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { type: 'INVALID_REQUEST_ERROR', reason: 'invalid card token' } }, { ok: false, status: 422 }),
    );

    await expect(tokenizeCard(input)).rejects.toMatchObject({ message: 'invalid card token' });
  });

  it('falls back to a generic message when there is no error field at all', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    await expect(tokenizeCard(input)).rejects.toMatchObject({
      message: 'Payment gateway rejected the card (status 500)',
    });
  });

  it('falls back to a generic message when the error field has neither reason nor messages', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { type: 'UNKNOWN' } }, { ok: false, status: 500 }));

    await expect(tokenizeCard(input)).rejects.toMatchObject({
      message: 'Payment gateway rejected the card (status 500)',
    });
  });

  it('falls back to a generic message when the error response body is not an object at all', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, { ok: false, status: 500 }));

    await expect(tokenizeCard(input)).rejects.toMatchObject({
      message: 'Payment gateway rejected the card (status 500)',
    });
  });

  it('throws GatewayTokenizeError when the response body is missing required fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { status: 'CREATED' } }, { ok: true, status: 201 }));

    await expect(tokenizeCard(input)).rejects.toBeInstanceOf(GatewayTokenizeError);
  });

  it('throws GatewayTokenizeError when the response body is not an object at all', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, { ok: true, status: 201 }));

    await expect(tokenizeCard(input)).rejects.toBeInstanceOf(GatewayTokenizeError);
  });

  it('throws GatewayTokenizeError when a successful response body is not valid JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.reject(new Error('not json')),
    } as Response);

    await expect(tokenizeCard(input)).rejects.toBeInstanceOf(GatewayTokenizeError);
  });

  it('throws GatewayTokenizeError when the network request itself fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(tokenizeCard(input)).rejects.toBeInstanceOf(GatewayTokenizeError);
  });

  describe('network resilience', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('aborts the request and throws GatewayTokenizeError after the timeout', async () => {
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

      const pending = tokenizeCard(input);
      const assertion = expect(pending).rejects.toBeInstanceOf(GatewayTokenizeError);
      await jest.advanceTimersByTimeAsync(15_000);
      await assertion;
    });

    it('passes an AbortSignal to the gateway fetch call', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: { id: 'tok_test_card', status: 'CREATED' } }, { ok: true, status: 201 }),
      );

      await tokenizeCard(input);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });
});
