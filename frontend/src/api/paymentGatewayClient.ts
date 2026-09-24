import { getEnv } from '../config/env';
import { redactCardNumbers } from '../domain/card/redact';
import { GatewayTokenizeError, type TokenizeCardInput, type TokenizeCardResult } from './types';

interface TokenizeCardResponse {
  status: string;
  data: {
    id: string;
  };
}

/**
 * The REAL sandbox response nests only `id` (plus brand/last_four/etc.,
 * none of which we read) under `data` — `status` ("CREATED") lives at the
 * TOP level, never duplicated inside `data`. An earlier version of this
 * guard required `data.status`, which the real gateway never sends: every
 * successful tokenization was misclassified as "malformed", silently
 * discarding a token that had already been created. Confirmed against a
 * live sandbox response before fixing.
 */
function isTokenizeCardResponse(value: unknown): value is TokenizeCardResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const status = (value as { status?: unknown }).status;
  const data = (value as { data?: unknown }).data;

  return (
    typeof status === 'string' &&
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { id?: unknown }).id === 'string'
  );
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * A FIXED, frontend-owned set of messages — the gateway's own error text is
 * NEVER rendered to the buyer verbatim. Third-party error text could echo
 * back input (in the worst case, fragments of the card number itself) or
 * simply be worded in a way we don't control; classifying by field NAME
 * only (never by message CONTENT) keeps this a closed, auditable set.
 */
const SAFE_GATEWAY_MESSAGES = {
  invalidCardNumber: 'The card number appears to be invalid.',
  expiredCard: 'The card has expired.',
  invalidCvc: 'The security code (CVC) appears to be invalid.',
  generic: 'The card was rejected by the payment provider. Please check your details and try again.',
} as const;

function classifyGatewayFieldNames(fieldNames: string[]): string {
  const lowered = fieldNames.map((name) => name.toLowerCase());

  if (lowered.some((name) => name.includes('number'))) {
    return SAFE_GATEWAY_MESSAGES.invalidCardNumber;
  }
  if (lowered.some((name) => name.includes('exp'))) {
    return SAFE_GATEWAY_MESSAGES.expiredCard;
  }
  if (lowered.some((name) => name.includes('cvc'))) {
    return SAFE_GATEWAY_MESSAGES.invalidCvc;
  }
  return SAFE_GATEWAY_MESSAGES.generic;
}

/**
 * Best-effort classification of the gateway's error body into one of the
 * allowlisted `SAFE_GATEWAY_MESSAGES` — shape-guarded against an untrusted
 * error body; any unexpected shape falls back to `undefined` (caller
 * supplies the generic status-code message in that case). The gateway's own
 * message TEXT (`messages[field]` values, `reason`) is deliberately never
 * read — only field NAMES and the mere presence of `reason` are inspected.
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
    const fieldNames = Object.keys(errorFields.messages as Record<string, unknown>);
    if (fieldNames.length > 0) {
      return classifyGatewayFieldNames(fieldNames);
    }
  }

  if (typeof errorFields.reason === 'string' && errorFields.reason.length > 0) {
    return SAFE_GATEWAY_MESSAGES.generic;
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
      redactCardNumbers(`Card tokenization request failed: ${(error as Error).message}`),
    );
  } finally {
    clearTimeout(timeout);
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new GatewayTokenizeError(
      redactCardNumbers(
        extractGatewayErrorMessage(body) ?? `Payment gateway rejected the card (status ${response.status})`,
      ),
    );
  }

  if (!isTokenizeCardResponse(body)) {
    throw new GatewayTokenizeError('Payment gateway returned a malformed tokenization response');
  }

  return { cardToken: body.data.id };
}
