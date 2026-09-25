import { useEffect } from 'react';
import { useAppDispatch, useAppStore } from '../../app/hooks';
import { parsePersistedState, STORAGE_KEY } from '../../shared/persistence/persistMiddleware';
import { otherTabStateAdopted } from './checkoutSlice';
import { resumeInFlightPayment } from './resumeInFlightPayment';

/**
 * Guards against a duplicated tab paying the same card token twice. A
 * browser's "Duplicate tab" copies sessionStorage, so two tabs can hold the
 * same token, bound to the same idempotency key. When the OTHER tab starts
 * paying (`submitAttempted`) or leaves SUMMARY under that key, it writes
 * localStorage, and this tab gets a `storage` event: it then drops its own
 * token and adopts the other tab's shared state (see `otherTabStateAdopted`).
 *
 * If that tab's payment is in flight, this tab looks it up under the same key
 * (as a refresh would) and then follows the other tab to RESULT once it is
 * answered, instead of asking the buyer for a card just to reach a replay.
 *
 * The key binding alone already makes a second Pay a backend replay; this
 * listener also stops the second tab from offering Pay at all.
 */
export function useCrossTabCheckoutSync(): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || event.newValue === null) {
        return;
      }
      const other = parsePersistedState(event.newValue);
      if (!other) {
        return;
      }
      const mine = store.getState().checkout;
      // Only a tab sitting idle on SUMMARY with the token reacts. A tab that
      // is paying itself (submitAttempted) must ignore the write-back the
      // other tab makes after adopting, or the two would bounce state back
      // and forth and the paying tab would abandon its own payment.
      const idleOnSummary = mine.step === 'SUMMARY' && mine.cardToken !== null && !mine.submitAttempted;
      const sameKey = mine.idempotencyKey !== null && other.checkout.idempotencyKey === mine.idempotencyKey;
      const otherTabMovedOn = other.checkout.submitAttempted || other.checkout.step !== 'SUMMARY';
      if (idleOnSummary && sameKey && otherTabMovedOn) {
        dispatch(otherTabStateAdopted(other));
        if (other.checkout.submitAttempted && other.checkout.step !== 'RESULT') {
          // The other tab's payment is in flight: look it up under the same
          // key, exactly as a refresh would. A 404 here usually just means
          // its POST has not landed yet, so the in-flight marker stays.
          void resumeInFlightPayment({ idempotencyKey: mine.idempotencyKey as string, dispatch, resolveOnNotFound: false });
        }
        return;
      }

      // Following an adopted in-flight attempt (no token of its own): once
      // the other tab's payment is answered, show the same RESULT.
      const followingAttempt = mine.cardToken === null && mine.submitAttempted && mine.step !== 'RESULT';
      if (followingAttempt && sameKey && other.checkout.step === 'RESULT') {
        dispatch(otherTabStateAdopted(other));
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [dispatch, store]);
}
