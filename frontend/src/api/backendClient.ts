import { getEnv } from '../config/env';
import {
  BackendApiError,
  type CreateTransactionInput,
  type PaymentAcceptance,
  type Product,
  type Transaction,
} from './types';

/**
 * The backend returns two different error body shapes depending on where
 * the rejection happened:
 *  - Nest's global `ValidationPipe` (DTO shape errors): `message` is an
 *    array of per-field strings.
 *  - The app's `DomainErrorFilter` (business-rule errors): `message` is a
 *    single string, alongside `error`/`statusCode`/`path`/`timestamp`.
 * Both are handled here so callers only ever see a single, readable
 * `BackendApiError.message`.
 */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    if (Array.isArray(message) && message.every((item) => typeof item === 'string') && message.length > 0) {
      return message.join('; ');
    }
  }

  return fallback || 'Unexpected backend error';
}

/** No real HTTP status applies to a network failure or a client-side timeout. */
const NETWORK_ERROR_STATUS = 0;
const REQUEST_TIMEOUT_MS = 15_000;

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiUrl } = getEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // An external signal (e.g. a poll loop that was cancelled) aborts our OWN
  // controller too, so the underlying fetch is cancelled for either reason
  // through a single code path below.
  const externalSignal = init?.signal;
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      signal: controller.signal,
      // Content-Type: application/json makes a request non-simple, so the
      // browser sends a CORS preflight first. Only requests with a JSON body
      // need it; body-less GETs (catalog, status polling) stay simple.
      headers: {
        ...(init?.body !== undefined && { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'Request timed out' : `Network error: ${(error as Error).message}`;
    throw new BackendApiError(reason, NETWORK_ERROR_STATUS);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }

  const body = await parseJsonBody(response);

  if (!response.ok) {
    throw new BackendApiError(extractErrorMessage(body, response.statusText), response.status);
  }

  return body as T;
}

export function fetchProducts(): Promise<Product[]> {
  return request<Product[]>('/products', { method: 'GET' });
}

export function fetchPaymentAcceptance(): Promise<PaymentAcceptance> {
  return request<PaymentAcceptance>('/payment-acceptance', { method: 'GET' });
}

export function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  return request<Transaction>('/transactions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchTransaction(id: string, options?: { signal?: AbortSignal }): Promise<Transaction> {
  return request<Transaction>(`/transactions/${id}`, { method: 'GET', signal: options?.signal });
}
