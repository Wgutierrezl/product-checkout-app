import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '../../app/hooks';
import { ResultScreen } from './ResultScreen';
import { pollStartedNow, transactionCleared } from './transactionSlice';
import {
  checkoutReset,
  idempotencyKeyRotated,
  stepChangeRequested,
  submitErrorSet,
  submitStatusSet,
} from '../checkout/checkoutSlice';
import { fetchProducts } from '../catalog/catalogThunks';
import { clearPersistedState } from '../../shared/persistence/persistMiddleware';
import { fetchAndDispatchTransaction, pollTransaction } from './pollTransactionThunk';

/**
 * The RESULT step: resumes polling `GET /transactions/:id` from the
 * persisted `pollStartedAt` (survives a refresh while still PENDING),
 * renders the outcome once final, and wires "Back to store"/"Try again".
 */
export function ResultContainer() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const transactionId = useAppSelector((state) => state.transaction.id);
  const status = useAppSelector((state) => state.transaction.status);
  const reference = useAppSelector((state) => state.transaction.reference);
  const amounts = useAppSelector((state) => state.transaction.amounts);
  const pollStartedAt = useAppSelector((state) => state.transaction.pollStartedAt);
  const delivery = useAppSelector((state) => state.checkout.delivery);

  const [pollExhausted, setPollExhausted] = useState(false);
  const isMountedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!transactionId) {
      return;
    }

    // Set (not just initialized) INSIDE the effect body, and cleared in
    // cleanup: React 18 StrictMode dev-double-invokes effects (mount ->
    // cleanup -> mount) to surface unsafe assumptions. A ref only ever
    // set `true` once at declaration would stay `false` forever after
    // that simulated unmount, silently stalling every future poll since
    // `signal.aborted` would look permanently true. Re-running this
    // assignment on every real mount keeps it correct across that cycle.
    isMountedRef.current = true;

    // A FRESH AbortController per effect invocation (not a shared ref) is
    // what actually makes StrictMode's double-invoke safe: the stale first
    // invocation's cleanup aborts ONLY its own controller, permanently and
    // independently of whatever the (correctly re-mounted) second
    // invocation's isMountedRef/controller state is doing — the abort
    // controller also cancels the in-flight fetch and any pending backoff
    // wait immediately (see pollTransactionThunk's `delay`).
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const current = store.getState().transaction;
    const startedAt = current.pollStartedAt ?? Date.now();
    if (current.pollStartedAt === null) {
      dispatch(pollStartedNow());
    }

    // Always checks at least once, even when the resumed status is
    // ALREADY final (e.g. refreshing on an APPROVED screen) -- reference
    // and amounts are never persisted, so a refresh otherwise leaves them
    // null indefinitely. pollTransaction stops after the first check once
    // it sees a final status, so this never causes extra polling.
    pollTransaction({
      transactionId,
      pollStartedAt: startedAt,
      dispatch,
      signal: controller.signal,
    }).then(() => {
      if (isMountedRef.current && !controller.signal.aborted) {
        setPollExhausted(true);
      }
    });

    return () => {
      isMountedRef.current = false;
      controller.abort();
    };
    // Re-runs only when the transaction identity changes; the loop reacts
    // to fresh state via `store.getState()`, not via this effect's deps.
  }, [transactionId, dispatch, store]);

  function handleCheckAgain() {
    if (!transactionId || !abortControllerRef.current) {
      return;
    }
    setPollExhausted(false);
    // Reuses the SAME controller the mount effect owns: if the component
    // unmounts (e.g. "Back to store") while this manual check is still in
    // flight, the effect's cleanup aborts it too, so a stale response can
    // never resurrect old transaction state into an already-reset store.
    const { signal } = abortControllerRef.current;
    fetchAndDispatchTransaction({ transactionId, dispatch, signal }).finally(() => {
      if (isMountedRef.current && !signal.aborted) {
        setPollExhausted(true);
      }
    });
  }

  /** Returns to DETAILS keeping customer/delivery/productId, with a fresh idempotencyKey for the new attempt. */
  function handleTryAgain() {
    dispatch(transactionCleared());
    dispatch(idempotencyKeyRotated());
    dispatch(submitErrorSet(null));
    dispatch(submitStatusSet('idle'));
    dispatch(stepChangeRequested('DETAILS'));
  }

  /** Fully resets the checkout/transaction slices, clears persisted storage, and refetches the catalog (stock may have changed). */
  function handleBackToStore() {
    dispatch(checkoutReset());
    dispatch(transactionCleared());
    clearPersistedState();
    dispatch(fetchProducts());
  }

  return (
    <ResultScreen
      status={status}
      reference={reference}
      amounts={amounts}
      delivery={delivery}
      pollExhausted={pollExhausted}
      pollStartedAt={pollStartedAt}
      onCheckAgain={handleCheckAgain}
      onTryAgain={handleTryAgain}
      onBackToStore={handleBackToStore}
    />
  );
}
