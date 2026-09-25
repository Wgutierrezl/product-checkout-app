import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../shared/ui/Button';
import { ResultIcon } from '../../shared/ui/ResultIcon';
import { Spinner } from '../../shared/ui/Spinner';
import { useOverlayA11y } from '../../shared/ui/useOverlayA11y';
import { formatCOP } from '../../domain/money/formatCOP';
import {
  msUntilNextProcessingStep,
  PROCESSING_STEPS,
  resolveProcessingStepIndex,
} from '../../domain/checkout/processingProgress';
import type { DeliveryInput, TransactionStatus } from '../../api/types';
import type { TransactionAmounts } from './transactionSlice';
import styles from './ResultScreen.module.css';

export interface ResultScreenProps {
  status: TransactionStatus | null;
  reference: string | null;
  amounts: TransactionAmounts | null;
  /** The buyer's OWN delivery address, sourced from LOCAL checkout state — never the server-masked `Transaction.delivery`. */
  delivery: DeliveryInput | null;
  /** True once the 60s poll budget has been spent without reaching a final status. */
  pollExhausted: boolean;
  /** When polling started; drives the cosmetic 3-step progress list. `null` before it's known. */
  pollStartedAt: number | null;
  onCheckAgain: () => void;
  onTryAgain: () => void;
  onBackToStore: () => void;
}

/** The Nth breakdown row shown on both the PENDING and final states, sourced from either `TransactionAmounts`. */
function AmountsBreakdown({ amounts }: { amounts: TransactionAmounts }) {
  return (
    <div className={styles.breakdown}>
      <div className={styles.breakdownRow}>
        <span>Product</span>
        <span>{formatCOP(amounts.productAmount)}</span>
      </div>
      <div className={styles.breakdownRow}>
        <span>Base fee</span>
        <span>{formatCOP(amounts.baseFee)}</span>
      </div>
      <div className={styles.breakdownRow}>
        <span>Delivery fee</span>
        <span>{formatCOP(amounts.deliveryFee)}</span>
      </div>
      <div className={`${styles.breakdownRow} ${styles.total}`}>
        <span>Total</span>
        <span>{formatCOP(amounts.total)}</span>
      </div>
    </div>
  );
}

const FAILURE_MESSAGES: Record<'DECLINED' | 'VOIDED' | 'ERROR', string> = {
  DECLINED: 'Your payment was declined by the card issuer.',
  VOIDED: 'This transaction was voided and was not charged.',
  ERROR: 'Something went wrong while processing your payment.',
};

/**
 * The RESULT step: PENDING (spinner, announced via `role="status"`, or a
 * "still processing" message with a manual retry past the poll cap),
 * APPROVED (confirmed reference + server amounts + the buyer's own
 * delivery address), or DECLINED/VOIDED/ERROR (clear message + retry).
 * The heading receives focus on every final-status render so screen
 * reader users land directly on the outcome, matching `Summary`'s
 * heading-focus convention.
 *
 * Shares `Modal`/`Summary`'s focus-trap + background-inert behavior via
 * `useOverlayA11y`, rendered through a portal (required for that hook's
 * "every other child of document.body" background-hiding logic to apply
 * correctly) — a single, stable overlay root spans all three sub-states
 * (null/PENDING/final) so the trap and inert-background stay active for
 * the whole time RESULT is on screen, not just whichever state happened
 * to be showing at mount.
 */
export function ResultScreen({
  status,
  reference,
  amounts,
  delivery,
  pollExhausted,
  pollStartedAt,
  onCheckAgain,
  onTryAgain,
  onBackToStore,
}: ResultScreenProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isApproved = status === 'APPROVED';
  const isFailure = status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR';
  const isFinal = isApproved || isFailure;
  const isPending = status === 'PENDING';

  useOverlayA11y({
    overlayRef,
    containerRef: overlayRef,
    onClose: onBackToStore,
    initialFocusRef: headingRef,
  });

  useEffect(() => {
    if (isFinal) {
      headingRef.current?.focus();
    }
  }, [isFinal, status]);

  const processingStepIndex =
    pollStartedAt === null ? 0 : resolveProcessingStepIndex(Date.now() - pollStartedAt);

  // Forces a re-render (carrying no state of its own) so the elapsed-time-
  // derived `processingStepIndex` above stays current. Schedules a SINGLE
  // timer for exactly when that index would next change (via
  // `msUntilNextProcessingStep`) rather than a 1s interval — over the whole
  // poll budget the step only actually changes twice, so this fires ~2
  // renders instead of ~60. Re-runs (and reschedules for the boundary after
  // that) each time `processingStepIndex` itself changes; stops for good
  // once there's nothing left to advance towards (exhausted, no
  // `pollStartedAt` yet, or already at the last step).
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!isPending || pollExhausted || pollStartedAt === null) {
      return;
    }
    const delayMs = msUntilNextProcessingStep(Date.now() - pollStartedAt);
    if (delayMs === null) {
      return;
    }
    const timeoutId = window.setTimeout(() => forceTick((tick) => tick + 1), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [isPending, pollExhausted, pollStartedAt, processingStepIndex]);

  return createPortal(
    <div
      className={`${styles.overlay} ${
        isApproved ? styles.approved : isFailure ? styles.declined : isPending ? styles.processing : ''
      }`}
      ref={overlayRef}
    >
      {status === null && (
        <>
          <p>Unable to load your transaction.</p>
          <Button type="button" onClick={onBackToStore}>
            Back to store
          </Button>
        </>
      )}

      {isPending && (
        <div className={styles.card}>
          {pollExhausted ? (
            <>
              <h2 className={styles.heading}>Processing your payment</h2>
              {/* aria-live="polite": announces ONCE when this text first
                  appears (screen readers only announce on a real content
                  change, and this string is static across re-renders while
                  exhausted stays true, so background polling never spams
                  repeat announcements). */}
              <p className={styles.message} aria-live="polite">
                Still processing your payment. This is taking longer than usual.
              </p>
              <Button type="button" onClick={onCheckAgain}>
                Check again
              </Button>
            </>
          ) : (
            <>
              {/* Purely decorative pulse — the accessible "in progress"
                  announcement is the role=status Spinner right below it. */}
              <span className={styles.processingRing} aria-hidden="true" />
              <h2 className={styles.heading}>Processing your payment</h2>
              <p className={styles.message}>Hang tight — this only takes a few seconds.</p>
              <Spinner label="Checking payment status…" />
              <ol className={styles.steps} aria-label="Payment progress">
                {PROCESSING_STEPS.map((step, index) => (
                  <li
                    key={step}
                    className={index <= processingStepIndex ? styles.stepDone : styles.step}
                    aria-current={index === processingStepIndex ? 'step' : undefined}
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </>
          )}

          {reference && <p className={styles.reference}>Reference: {reference}</p>}
          {amounts && <AmountsBreakdown amounts={amounts} />}
        </div>
      )}

      {isFinal && (
        <div className={styles.card}>
          <ResultIcon variant={isApproved ? 'approved' : 'failure'} />
          <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>
            {isApproved ? 'Payment approved' : 'Payment not completed'}
          </h2>
          <p className={styles.message}>
            {isApproved ? 'Thank you for your purchase!' : FAILURE_MESSAGES[status as 'DECLINED' | 'VOIDED' | 'ERROR']}
          </p>
          {reference && <p className={styles.reference}>Reference: {reference}</p>}

          {amounts && <AmountsBreakdown amounts={amounts} />}

          {isApproved && delivery && (
            <p className={styles.address}>
              Delivering to: {delivery.address}, {delivery.city}, {delivery.region}
              {delivery.postalCode ? `, ${delivery.postalCode}` : ''}
            </p>
          )}

          <div className={styles.actions}>
            {isFailure && (
              <Button type="button" variant="secondary" onClick={onTryAgain}>
                Try again
              </Button>
            )}
            <Button type="button" onClick={onBackToStore}>
              Back to store
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
