import { fetchTransaction } from '../../api/backendClient';
import { BackendApiError, type TransactionStatus } from '../../api/types';
import { isFinalTransactionStatus, nextPollDelayMs, remainingPollBudgetMs } from '../../domain/checkout/pollBackoff';
import { transactionErrorSet, transactionReceived } from './transactionSlice';

/** Resolves after `ms`, or immediately if `signal` is already/becomes aborted -- the timer is cleared either way, never left dangling. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeoutId = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Only the two action creators this module ever dispatches — deliberately
 * narrower than the app's full `AppDispatch` so this module stays
 * decoupled from `app/store` and trivially testable with a plain `jest.fn`.
 */
type TransactionDispatch = (action: ReturnType<typeof transactionReceived> | ReturnType<typeof transactionErrorSet>) => void;

export interface FetchAndDispatchOptions {
  transactionId: string;
  dispatch: TransactionDispatch;
  /**
   * Aborts the underlying `GET /transactions/:id` network call (forwarded
   * to `fetchTransaction`) AND guards against a stale response landing
   * after the caller stopped caring (e.g. the buyer clicked "Back to
   * store" while a manual "Check again" was in flight) — checked right
   * after the response arrives, before dispatching anything.
   */
  signal?: AbortSignal;
}

/**
 * A single `GET /transactions/:id` check: dispatches `transactionReceived`
 * on success (returning the new status) or `transactionErrorSet` on
 * failure (returning `null`). Shared by the polling loop below and by the
 * manual "Check again" action once the poll budget is exhausted.
 */
export async function fetchAndDispatchTransaction({
  transactionId,
  dispatch,
  signal,
}: FetchAndDispatchOptions): Promise<TransactionStatus | null> {
  try {
    const transaction = await fetchTransaction(transactionId, { signal });
    if (signal?.aborted) {
      return null;
    }
    dispatch(
      transactionReceived({
        id: transaction.id,
        status: transaction.status,
        reference: transaction.reference,
        amounts: {
          productAmount: transaction.productAmount,
          baseFee: transaction.baseFee,
          deliveryFee: transaction.deliveryFee,
          total: transaction.total,
          currency: transaction.currency,
        },
      }),
    );
    return transaction.status;
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    dispatch(
      transactionErrorSet(error instanceof BackendApiError ? error.message : 'Could not check payment status.'),
    );
    return null;
  }
}

export interface PollTransactionOptions {
  transactionId: string;
  /** Persisted, so the same window survives a page refresh. */
  pollStartedAt: number;
  dispatch: TransactionDispatch;
  /** Aborts the in-flight fetch AND cancels a pending backoff wait immediately, instead of waiting for either to resolve naturally. */
  signal: AbortSignal;
}

/**
 * Polls `GET /transactions/:id` with linear backoff (1s -> 5s cap) until a
 * final status (`APPROVED`/`DECLINED`/`VOIDED`/`ERROR`) is reached or the
 * 60s budget measured from `pollStartedAt` runs out. A network/backend
 * error during polling never aborts the loop — it just retries on the next
 * scheduled attempt, same as any other still-pending result. Always
 * performs at least one check, even if the budget is already exhausted at
 * call time (e.g. resuming long after a refresh), so the buyer's screen
 * reflects a fresh status rather than stale persisted data.
 */
export async function pollTransaction({
  transactionId,
  pollStartedAt,
  dispatch,
  signal,
}: PollTransactionOptions): Promise<void> {
  let attempt = 0;

  while (!signal.aborted) {
    attempt += 1;
    const status = await fetchAndDispatchTransaction({ transactionId, dispatch, signal });

    if (signal.aborted) {
      return;
    }
    if (status && isFinalTransactionStatus(status)) {
      return;
    }

    const remainingBudget = remainingPollBudgetMs(pollStartedAt, Date.now());
    if (remainingBudget <= 0) {
      return;
    }

    await delay(Math.min(nextPollDelayMs(attempt), remainingBudget), signal);
  }
}
