import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '../../app/hooks';
import { ResultScreen } from './ResultScreen';
import { pollStarted, transactionCleared } from './transactionSlice';
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
  const delivery = useAppSelector((state) => state.checkout.delivery);

  const [pollExhausted, setPollExhausted] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!transactionId) {
      return;
    }
    const current = store.getState().transaction;
    if (current.status !== 'PENDING') {
      return;
    }

    // Resumes from an EXISTING pollStartedAt (survives a refresh) rather
    // than granting a fresh 60s budget; only a brand-new transaction (never
    // persisted yet) gets one set here.
    const startedAt = current.pollStartedAt ?? Date.now();
    if (current.pollStartedAt === null) {
      dispatch(pollStarted(startedAt));
    }

    pollTransaction({
      transactionId,
      pollStartedAt: startedAt,
      dispatch,
      isCancelled: () => !isMountedRef.current,
    }).then(() => {
      if (isMountedRef.current) {
        setPollExhausted(true);
      }
    });
    // Re-runs only when the transaction identity changes; the loop reacts
    // to fresh state via `store.getState()`, not via this effect's deps.
  }, [transactionId, dispatch, store]);

  function handleCheckAgain() {
    if (!transactionId) {
      return;
    }
    setPollExhausted(false);
    fetchAndDispatchTransaction({ transactionId, dispatch }).finally(() => {
      if (isMountedRef.current) {
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
      onCheckAgain={handleCheckAgain}
      onTryAgain={handleTryAgain}
      onBackToStore={handleBackToStore}
    />
  );
}
