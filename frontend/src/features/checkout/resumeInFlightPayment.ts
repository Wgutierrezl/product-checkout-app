import { fetchTransaction } from '../../api/backendClient';
import { BackendApiError } from '../../api/types';
import { cardTokenConsumed, paymentAttemptResolved, stepForced } from './checkoutSlice';
import { pollStarted, transactionReceived } from '../transaction/transactionSlice';

/**
 * Only the actions this module ever dispatches -- kept narrow (rather than
 * the app's full `AppDispatch`) so this module stays trivially testable
 * with a plain `jest.fn`, matching `pollTransactionThunk`'s pattern.
 */
type ResumeDispatch = (
  action:
    | ReturnType<typeof transactionReceived>
    | ReturnType<typeof pollStarted>
    | ReturnType<typeof cardTokenConsumed>
    | ReturnType<typeof paymentAttemptResolved>
    | ReturnType<typeof stepForced>,
) => void;

export interface ResumeInFlightPaymentOptions {
  idempotencyKey: string;
  dispatch: ResumeDispatch;
}

/**
 * Resolves a payment attempt that was still in flight when the page was
 * refreshed (see `checkoutSlice.submitAttempted`): rather than blindly
 * rotating the idempotencyKey -- which could let a request that DID reach
 * the backend be charged again under a brand new, untracked key -- this
 * checks `GET /transactions/:idempotencyKey`. The backend persists a
 * transaction under an id EQUAL to the idempotencyKey it was created with
 * (see `create-transaction.use-case.ts`'s `persistPending`), so this
 * lookup definitively answers "did that Pay click actually land?".
 *
 * - 200 (it landed, any status including already-final): resumes RESULT
 *   for that transaction with a fresh poll window -- the original window,
 *   if any, was never observed by this session. `cardTokenConsumed` is
 *   dispatched (the in-memory token is gone after a refresh regardless),
 *   and the step is FORCED to RESULT (`stepForced`, not
 *   `stepChangeRequested`) because the normal cardToken-based RESULT gate
 *   would otherwise block this legitimate resume.
 * - 404 (nothing was ever created): completely safe to keep reusing this
 *   key for the next attempt -- never rotate here, since a still-pending
 *   request that DOES eventually land would then create a second,
 *   untracked transaction under a new key (a real double-charge risk).
 *   The buyer is already on DETAILS (see persistMiddleware's
 *   SUMMARY -> DETAILS downgrade), so no step change is needed.
 * - Anything else (network error, 5xx): genuinely unknown -- `submitAttempted`
 *   is deliberately left as-is so a later reload/retry re-checks.
 */
export async function resumeInFlightPayment({ idempotencyKey, dispatch }: ResumeInFlightPaymentOptions): Promise<void> {
  try {
    const transaction = await fetchTransaction(idempotencyKey);

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
    dispatch(pollStarted(Date.now()));
    dispatch(cardTokenConsumed());
    dispatch(paymentAttemptResolved());
    dispatch(stepForced('RESULT'));
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) {
      dispatch(paymentAttemptResolved());
    }
    // Any other error: leave submitAttempted untouched, retry later.
  }
}
