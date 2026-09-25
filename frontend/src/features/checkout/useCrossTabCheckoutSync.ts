import { useEffect } from 'react';
import { useAppDispatch, useAppStore } from '../../app/hooks';
import { parsePersistedState, STORAGE_KEY } from '../../shared/persistence/persistMiddleware';
import { otherTabStateAdopted } from './checkoutSlice';

/**
 * Guards against a duplicated tab paying the same card token twice. A
 * browser's "Duplicate tab" copies sessionStorage, so two tabs can hold the
 * same token, bound to the same idempotency key. When the OTHER tab starts
 * paying (`submitAttempted`) or leaves SUMMARY under that key, it writes
 * localStorage, and this tab gets a `storage` event: it then drops its own
 * token and adopts the other tab's shared state (see `otherTabStateAdopted`).
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
      const sameCheckout = idleOnSummary && other.checkout.idempotencyKey === mine.idempotencyKey;
      const otherTabMovedOn = other.checkout.submitAttempted || other.checkout.step !== 'SUMMARY';
      if (sameCheckout && otherTabMovedOn) {
        dispatch(otherTabStateAdopted(other));
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [dispatch, store]);
}
