import { Button } from '../../shared/ui/Button';
import { CardBrandIcon } from '../../shared/ui/CardBrandIcon';
import { formatCOP } from '../../domain/money/formatCOP';
import { computeOrderPreview } from '../../domain/checkout/orderPreview';
import type { DeliveryInput } from '../../api/types';
import type { CardSummary } from './checkoutSlice';
import styles from './Summary.module.css';

export interface SummaryProductInfo {
  name: string;
  imageUrl: string;
  quantity: number;
  /** Unit price, in integer cents. */
  price: number;
}

export interface SummaryAcceptanceLinks {
  termsUrl: string;
  personalDataUrl: string;
}

export interface SummaryProps {
  product: SummaryProductInfo | null;
  cardSummary: CardSummary | null;
  delivery: DeliveryInput | null;
  acceptanceLinks: SummaryAcceptanceLinks | null;
  acceptanceError: string | null;
  termsAccepted: boolean;
  personalDataAccepted: boolean;
  onToggleTerms: () => void;
  onTogglePersonalData: () => void;
  isSubmitting: boolean;
  submitError: string | null;
  onPay: () => void;
  onEditDetails: () => void;
}

/**
 * Material-style backdrop: a dimmed "back layer" keeps the selected
 * product's image/name/quantity visible as context, while the "front"
 * sheet (this order summary) slides up over it. The breakdown shown here
 * is always a CLIENT-COMPUTED ESTIMATE (see `computeOrderPreview`) — the
 * real `Transaction` amounts from the backend are the only authoritative
 * source, shown on the RESULT screen after a successful submission.
 */
export function Summary({
  product,
  cardSummary,
  delivery,
  acceptanceLinks,
  acceptanceError,
  termsAccepted,
  personalDataAccepted,
  onToggleTerms,
  onTogglePersonalData,
  isSubmitting,
  submitError,
  onPay,
  onEditDetails,
}: SummaryProps) {
  const preview = product ? computeOrderPreview({ unitPrice: product.price, quantity: product.quantity }) : null;
  const canPay = termsAccepted && personalDataAccepted && acceptanceLinks !== null && !isSubmitting;

  return (
    <div className={styles.overlay}>
      <div className={styles.backLayer}>
        {product && (
          <>
            <img className={styles.backImage} src={product.imageUrl} alt={product.name} width={56} height={56} />
            <div className={styles.backInfo}>
              <span className={styles.backName}>{product.name}</span>
              <span className={styles.backQuantity}>Qty: {product.quantity}</span>
            </div>
          </>
        )}
      </div>

      <section className={styles.sheet} aria-label="Order summary">
        <h2 className={styles.sectionTitle}>Order summary</h2>

        {submitError && (
          <p role="alert" className={styles.alert}>
            {submitError}
          </p>
        )}

        {!product ? (
          <p>Unable to load order details.</p>
        ) : (
          <>
            <div className={styles.breakdown}>
              <div className={styles.breakdownRow}>
                <span>Product</span>
                <span>{formatCOP(preview!.productAmount)}</span>
              </div>
              <div className={styles.breakdownRow}>
                <span>Base fee</span>
                <span>{formatCOP(preview!.baseFee)}</span>
              </div>
              <div className={styles.breakdownRow}>
                <span>Delivery fee</span>
                <span>{formatCOP(preview!.deliveryFee)}</span>
              </div>
              <div className={`${styles.breakdownRow} ${styles.total}`}>
                <span>Total</span>
                <span>{formatCOP(preview!.total)}</span>
              </div>
            </div>
            <p className={styles.estimateNote}>
              Estimate — the confirmed amount is shown once payment is processed.
            </p>

            {cardSummary && (
              <div className={styles.cardRow}>
                <CardBrandIcon brand={cardSummary.brand} />
                <span>•••• {cardSummary.last4}</span>
                <span>{cardSummary.holder}</span>
              </div>
            )}

            {delivery && (
              <p className={styles.address}>
                {delivery.address}, {delivery.city}, {delivery.region}
                {delivery.postalCode ? `, ${delivery.postalCode}` : ''}
              </p>
            )}
          </>
        )}

        {acceptanceError && (
          <p role="alert" className={styles.alert}>
            {acceptanceError}
          </p>
        )}

        <label className={styles.consent}>
          <input type="checkbox" checked={termsAccepted} onChange={onToggleTerms} disabled={!acceptanceLinks} />
          <span>
            I accept the{' '}
            {acceptanceLinks ? (
              <a href={acceptanceLinks.termsUrl} target="_blank" rel="noopener noreferrer">
                terms and conditions
              </a>
            ) : (
              'terms and conditions'
            )}
          </span>
        </label>

        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={personalDataAccepted}
            onChange={onTogglePersonalData}
            disabled={!acceptanceLinks}
          />
          <span>
            I authorize the use of my{' '}
            {acceptanceLinks ? (
              <a href={acceptanceLinks.personalDataUrl} target="_blank" rel="noopener noreferrer">
                personal data
              </a>
            ) : (
              'personal data'
            )}
          </span>
        </label>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onEditDetails}>
            Edit details
          </Button>
          <Button type="button" disabled={!canPay} onClick={onPay}>
            {isSubmitting ? 'Processing…' : 'Pay'}
          </Button>
        </div>
      </section>
    </div>
  );
}
