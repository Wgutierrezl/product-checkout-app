import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { resumeInFlightPayment } from './resumeInFlightPayment';

/**
 * Runs once per app boot: if the persisted state shows a payment attempt
 * was still in flight when the page was last unloaded (`Pay` was pressed,
 * but this session never observed the outcome — see
 * `checkoutSlice.submitAttempted`), resolves the ambiguity via
 * `resumeInFlightPayment` instead of leaving the buyer on a silently
 * incorrect DETAILS step while a transaction may already exist.
 */
export function useResumeInFlightPayment(): void {
  const dispatch = useAppDispatch();
  const submitAttempted = useAppSelector((state) => state.checkout.submitAttempted);
  const idempotencyKey = useAppSelector((state) => state.checkout.idempotencyKey);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current || !submitAttempted || !idempotencyKey) {
      return;
    }
    hasRunRef.current = true;
    void resumeInFlightPayment({ idempotencyKey, dispatch });
  }, [submitAttempted, idempotencyKey, dispatch]);
}
