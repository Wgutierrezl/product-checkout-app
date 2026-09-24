import { fetchTransaction } from '../../api/backendClient';
import { BackendApiError, type TransactionStatus } from '../../api/types';
import { isFinalTransactionStatus, nextPollDelayMs, remainingPollBudgetMs } from '../../domain/checkout/pollBackoff';
import { transactionErrorSet, transactionReceived } from './transactionSlice';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
   * Checked right after the response arrives, before dispatching — guards
   * against a stale result landing after the caller stopped caring (e.g.
   * the buyer navigated away while a manual "Check again" was in flight),
   * matching the `isMountedRef` guard used elsewhere in the checkout flow.
   */
  isCancelled?: () => boolean;
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
  isCancelled = () => false,
}: FetchAndDispatchOptions): Promise<TransactionStatus | null> {
  try {
    const transaction = await fetchTransaction(transactionId);
    if (isCancelled()) {
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
    if (isCancelled()) {
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
  isCancelled: () => boolean;
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
  isCancelled,
}: PollTransactionOptions): Promise<void> {
  let attempt = 0;

  while (!isCancelled()) {
    attempt += 1;
    const status = await fetchAndDispatchTransaction({ transactionId, dispatch, isCancelled });

    if (isCancelled()) {
      return;
    }
    if (status && isFinalTransactionStatus(status)) {
      return;
    }

    const remainingBudget = remainingPollBudgetMs(pollStartedAt, Date.now());
    if (remainingBudget <= 0) {
      return;
    }

    await delay(Math.min(nextPollDelayMs(attempt), remainingBudget));
  }
}
