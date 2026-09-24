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

  it('throws GatewayTokenizeError when the response body is malformed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { status: 'CREATED' } }, { ok: true, status: 201 }));

    await expect(tokenizeCard(input)).rejects.toBeInstanceOf(GatewayTokenizeError);
  });

  it('throws GatewayTokenizeError when the network request itself fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(tokenizeCard(input)).rejects.toBeInstanceOf(GatewayTokenizeError);
  });
});
