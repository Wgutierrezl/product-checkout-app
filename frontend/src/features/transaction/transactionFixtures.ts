import type { Transaction } from '../../api/types';

/**
 * Shared test builder for a `Transaction` API response — used by every test
 * file that mocks `backendClient.fetchTransaction`/`createTransaction`
 * (`pollTransactionThunk.test.ts`, `resumeInFlightPayment.test.ts`,
 * `ResultContainer.test.tsx`) instead of each duplicating its own local
 * `transaction(overrides)` helper with the same default shape.
 */
export function buildTransactionFixture(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    reference: 'REF-1',
    status: 'PENDING',
    productAmount: 300_000,
    baseFee: 250_000,
    deliveryFee: 800_000,
    total: 1_350_000,
    currency: 'COP',
    ...overrides,
  };
}
