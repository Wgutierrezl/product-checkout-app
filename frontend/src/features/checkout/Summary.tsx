import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../shared/ui/Button';
import { CardBrandIcon } from '../../shared/ui/CardBrandIcon';
import { useOverlayA11y } from '../../shared/ui/useOverlayA11y';
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
 *
 * Behaves like a full-screen modal (focus trap, initial focus on the
 * heading, Escape returns to "Edit details", background inert while
 * mounted) via the same `useOverlayA11y` hook `Modal` uses — rendered
 * through a portal so the hook's "every other child of document.body"
 * background-hiding logic applies correctly. This is deliberately NOT the
 * `shared/ui/Backdrop` component: that one is a click-to-dismiss overlay
 * for a transient dialog, while this step is non-dismissible by
 * backdrop-click ("Edit details" is the only way back).
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

  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useOverlayA11y({ overlayRef, containerRef: sheetRef, onClose: onEditDetails, initialFocusRef: headingRef });

  return createPortal(
    <div className={styles.overlay} ref={overlayRef}>
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

      <section className={styles.sheet} aria-label="Order summary" ref={sheetRef}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.sectionTitle}>
          Order summary
        </h2>

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

        {/* `disabled` on a <fieldset> propagates to both checkboxes, adding
            "paying" as a 2nd reason (alongside acceptance links still
            loading) they can be locked — a native visual + functional
            disabled look without repeating `|| isSubmitting` on each input. */}
        <fieldset className={styles.consentFieldset} disabled={isSubmitting}>
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
        </fieldset>

        {/* One wrapper for the buttons AND the status line so, on small
            screens, the "don't close this window" notice sticks with the
            buttons instead of scrolling away beneath them. */}
        <div className={styles.footer}>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onEditDetails} disabled={isSubmitting}>
              Edit details
            </Button>
            <Button type="button" disabled={!canPay} loading={isSubmitting} loadingLabel="Processing payment…" onClick={onPay}>
              Pay
            </Button>
          </div>
          {isSubmitting && (
            <p className={styles.statusLine} role="status">
              Processing your payment — please don&rsquo;t close this window.
            </p>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
