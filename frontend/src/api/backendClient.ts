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

async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiUrl } = getEnv();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

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

export function fetchTransaction(id: string): Promise<Transaction> {
  return request<Transaction>(`/transactions/${id}`, { method: 'GET' });
}
