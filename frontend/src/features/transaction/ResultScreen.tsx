import { useEffect, useRef } from 'react';
import { Button } from '../../shared/ui/Button';
import { Spinner } from '../../shared/ui/Spinner';
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isApproved = status === 'APPROVED';
  const isFailure = status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR';
  const isFinal = isApproved || isFailure;

  useEffect(() => {
    if (isFinal) {
      headingRef.current?.focus();
    }
  }, [isFinal, status]);

  if (status === null) {
    return (
      <div className={styles.overlay}>
        <p>Unable to load your transaction.</p>
        <Button type="button" onClick={onBackToStore}>
          Back to store
        </Button>
      </div>
    );
  }

  if (status === 'PENDING') {
    return (
      <div className={styles.overlay}>
        {pollExhausted ? (
          <div className={styles.pending}>
            <p>Still processing your payment. This is taking longer than usual.</p>
            <Button type="button" onClick={onCheckAgain}>
              Check again
            </Button>
          </div>
        ) : (
          <Spinner label="Checking payment status…" />
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.overlay} ${isApproved ? styles.approved : styles.declined}`}>
      <div className={styles.card}>
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
    </div>
  );
}
