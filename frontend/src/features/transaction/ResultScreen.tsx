import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../shared/ui/Button';
import { ResultIcon } from '../../shared/ui/ResultIcon';
import { Spinner } from '../../shared/ui/Spinner';
import { useOverlayA11y } from '../../shared/ui/useOverlayA11y';
import { formatCOP } from '../../domain/money/formatCOP';
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
  onCheckAgain: () => void;
  onTryAgain: () => void;
  onBackToStore: () => void;
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
  onCheckAgain,
  onTryAgain,
  onBackToStore,
}: ResultScreenProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isApproved = status === 'APPROVED';
  const isFailure = status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR';
  const isFinal = isApproved || isFailure;

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

  return createPortal(
    <div
      className={`${styles.overlay} ${isApproved ? styles.approved : isFailure ? styles.declined : ''}`}
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

      {status === 'PENDING' &&
        (pollExhausted ? (
          <div className={styles.pending}>
            {/* aria-live="polite": announces ONCE when this text first
                appears (screen readers only announce on a real content
                change, and this string is static across re-renders while
                exhausted stays true, so background polling never spams
                repeat announcements). */}
            <p aria-live="polite">Still processing your payment. This is taking longer than usual.</p>
            <Button type="button" onClick={onCheckAgain}>
              Check again
            </Button>
          </div>
        ) : (
          <Spinner label="Checking payment status…" />
        ))}

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

          {amounts && (
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
          )}

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
