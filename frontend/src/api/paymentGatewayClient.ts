import { getEnv } from '../config/env';
import { GatewayTokenizeError, type TokenizeCardInput, type TokenizeCardResult } from './types';

interface TokenizeCardResponse {
  data: {
    id: string;
    status: string;
  };
}

function isTokenizeCardResponse(value: unknown): value is TokenizeCardResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const data = (value as { data?: unknown }).data;

  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { id?: unknown }).id === 'string' &&
    typeof (data as { status?: unknown }).status === 'string'
  );
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Tokenizes a card DIRECTLY against the payment gateway's public
 * tokenization endpoint, authenticated with the PUBLIC key only — this is
 * the only client allowed to touch raw PAN/CVC, and the backend never sees
 * them (see design Amendment: tokenize at Continue).
 */
export async function tokenizeCard(input: TokenizeCardInput): Promise<TokenizeCardResult> {
  const { paymentGatewayUrl, paymentGatewayPublicKey } = getEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${paymentGatewayUrl}/tokens/cards`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${paymentGatewayPublicKey}`,
      },
      body: JSON.stringify({
        number: input.number,
        cvc: input.cvc,
        exp_month: input.expMonth,
        exp_year: input.expYear,
        card_holder: input.cardHolder,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GatewayTokenizeError('Card tokenization request timed out');
    }
    throw new GatewayTokenizeError(
      `Card tokenization request failed: ${(error as Error).message}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new GatewayTokenizeError(`Payment gateway rejected the card (status ${response.status})`);
  }

  if (!isTokenizeCardResponse(body)) {
    throw new GatewayTokenizeError('Payment gateway returned a malformed tokenization response');
  }

  return { cardToken: body.data.id };
}
