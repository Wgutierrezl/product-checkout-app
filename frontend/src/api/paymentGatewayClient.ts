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
 * Best-effort extraction of the gateway's own validation feedback, so the
 * buyer sees e.g. "number: is invalid" instead of a bare status code.
 * Shape-guarded against an untrusted error body — either field is optional
 * and any unexpected shape falls back to `undefined` (caller supplies the
 * generic message in that case).
 */
function extractGatewayErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const errorFields = error as Record<string, unknown>;

  if (typeof errorFields.messages === 'object' && errorFields.messages !== null) {
    const parts: string[] = [];
    for (const [field, value] of Object.entries(errorFields.messages as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') {
            parts.push(`${field}: ${item}`);
          }
        }
      }
    }
    if (parts.length > 0) {
      return parts.join('; ');
    }
  }

  if (typeof errorFields.reason === 'string' && errorFields.reason.length > 0) {
    return errorFields.reason;
  }

  return undefined;
}

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
    throw new GatewayTokenizeError(
      extractGatewayErrorMessage(body) ?? `Payment gateway rejected the card (status ${response.status})`,
    );
  }

  if (!isTokenizeCardResponse(body)) {
    throw new GatewayTokenizeError('Payment gateway returned a malformed tokenization response');
  }

  return { cardToken: body.data.id };
}
