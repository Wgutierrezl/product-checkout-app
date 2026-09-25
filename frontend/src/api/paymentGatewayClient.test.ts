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
      jsonResponse({ status: 'CREATED', data: { id: 'tok_test_card' } }, { ok: true, status: 201 }),
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

  it('maps a "number" field error to the allowlisted invalid-card-number message, never the raw gateway text', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { type: 'INVALID_REQUEST_ERROR', messages: { number: ['4111111111111111 is invalid'] } } },
        { ok: false, status: 422 },
      ),
    );

    await expect(tokenizeCard(input)).rejects.toMatchObject({
      message: 'The card number appears to be invalid.',
    });
  });

  it('maps an "exp_month"/"exp_year" field error to the allowlisted expired-card message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { messages: { exp_year: ['is in the past'] } } },
        { ok: false, status: 422 },
      ),
    );

    await expect(tokenizeCard(input)).rejects.toMatchObject({ message: 'The card has expired.' });
  });

  it('maps a "cvc" field error to the allowlisted invalid-CVC message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { messages: { cvc: ['is too short'] } } }, { ok: false, status: 422 }),
    );

    await expect(tokenizeCard(input)).rejects.toMatchObject({
      message: 'The security code (CVC) appears to be invalid.',
    });
  });

  it('maps an unrecognized field name to the generic allowlisted message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { messages: { card_holder: ['is required'] } } }, { ok: false, status: 422 }),
    );

    await expect(tokenizeCard(input)).rejects.toMatchObject({
      message: 'The card was rejected by the payment provider. Please check your details and try again.',
    });
  });

  it('falls back to the generic message when messages is present but yields no field names', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { messages: {}, reason: 'invalid card token' } }, { ok: false, status: 422 }),
    );

    await expect(tokenizeCard(input)).rejects.toMatchObject({
      message: 'The card was rejected by the payment provider. Please check your details and try again.',
    });
  });

  it('never renders the raw "reason" text verbatim, even when it looks safe', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { type: 'INVALID_REQUEST_ERROR', reason: 'card 4111111111111111 was rejected by issuer' } },
        { ok: false, status: 422 },
      ),
    );

    const rejection = tokenizeCard(input);
    await expect(rejection).rejects.toMatchObject({
      message: 'The card was rejected by the payment provider. Please check your details and try again.',
    });
    await expect(rejection).rejects.not.toMatchObject({ message: expect.stringContaining('4111111111111111') });
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'CREATED', data: {} }, { ok: true, status: 201 }));

    await expect(tokenizeCard(input)).rejects.toBeInstanceOf(GatewayTokenizeError);
  });

  it('accepts the REAL sandbox tokenize response shape (top-level status, no nested data.status)', async () => {
    // Captured verbatim from the sandbox: `status` lives at the TOP level only —
    // `data` never carries its own `status` field. A type guard that required
    // `data.status` would reject every real tokenization as "malformed".
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          status: 'CREATED',
          data: {
            id: 'tok_stagtest_5113_8Ea66dd1390eCd7ad07904F16ceF02d3',
            created_at: '2026-09-24T18:23:13.779+00:00',
            brand: 'VISA',
            name: 'VISA-4242',
            last_four: '4242',
            bin: '424242',
            exp_year: '29',
            exp_month: '12',
            card_holder: 'ANA RESTREPO',
            created_with_cvc: true,
          },
        },
        { ok: true, status: 201 },
      ),
    );

    await expect(tokenizeCard(input)).resolves.toEqual({
      cardToken: 'tok_stagtest_5113_8Ea66dd1390eCd7ad07904F16ceF02d3',
    });
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
        jsonResponse({ status: 'CREATED', data: { id: 'tok_test_card' } }, { ok: true, status: 201 }),
      );

      await tokenizeCard(input);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });
});
