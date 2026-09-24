import { useEffect } from 'react';
import { useAppDispatch, useAppStore } from '../../app/hooks';
import { resumeInFlightPayment } from './resumeInFlightPayment';

/**
 * Runs EXACTLY once per app boot, reading `submitAttempted`/`idempotencyKey`
 * from `store.getState()` at that single moment rather than subscribing to
 * them via `useAppSelector` — subscribing would re-run this effect the
 * moment a LIVE `Pay` click sets `submitAttempted` true THIS session
 * (`SummaryContainer.handlePay` dispatches `paymentAttemptStarted()`
 * before its own `createTransaction` POST resolves), racing this hook's
 * `GET /transactions/:idempotencyKey` against that in-flight POST. Found
 * running the real checkout against a live gateway: the race's most
 * common outcome is a spurious 404 (the record doesn't exist yet), and on
 * a 404 `resumeInFlightPayment` dispatches `paymentAttemptResolved()`,
 * which prematurely clears `submitAttempted` — defeating the exact
 * safety net a refresh mid-POST is supposed to rely on. Only a
 * REHYDRATED-FROM-A-PREVIOUS-SESSION `submitAttempted` (true at the
 * moment this hook first mounts) should ever trigger a resume check.
 */
export function useResumeInFlightPayment(): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    const { submitAttempted, idempotencyKey } = store.getState().checkout;
    if (!submitAttempted || !idempotencyKey) {
      return;
    }
    void resumeInFlightPayment({ idempotencyKey, dispatch });
    // Intentionally empty: this must run exactly once, using the state as
    // it existed at mount — never react to live changes afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
