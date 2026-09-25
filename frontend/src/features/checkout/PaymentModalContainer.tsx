import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { Modal } from '../../shared/ui/Modal';
import { PaymentForm, type PaymentFormSubmitValues } from './PaymentForm';
import {
  cardTokenized,
  customerAndDeliverySet,
  formDraftCleared,
  formDraftSaved,
  installmentsSet,
  type PaymentFormDraft,
  stepChangeRequested,
  submitErrorSet,
  submitStatusSet,
  tokenizeFailed,
} from './checkoutSlice';
import { tokenizeCard } from '../../api/paymentGatewayClient';
import { detectCardBrand } from '../../domain/card/brand';
import { getLast4 } from '../../domain/card/mask';

const MODAL_TITLE_ID = 'payment-modal-title';

/**
 * Wraps `PaymentForm` in the `Modal`, connecting it to the checkout slice.
 * On successful tokenization dispatches `cardTokenized` + the card summary
 * + customer/delivery, and moves the step to SUMMARY. On failure, records
 * the error and keeps the buyer on DETAILS — customer/delivery are only
 * ever committed to the store on a SUCCESSFUL Continue (see design
 * Amendment: tokenize at Continue). Meanwhile a debounced draft of the
 * non-card fields is kept in the store (and persisted) so a refresh does
 * not lose what the buyer typed; Cancel forgets it.
 */
export function PaymentModalContainer() {
  const dispatch = useAppDispatch();
  const customer = useAppSelector((state) => state.checkout.customer);
  const delivery = useAppSelector((state) => state.checkout.delivery);
  const installments = useAppSelector((state) => state.checkout.installments);
  const formDraft = useAppSelector((state) => state.checkout.formDraft);
  const draftRestored = useAppSelector((state) => state.checkout.draftRestored);
  const submitStatus = useAppSelector((state) => state.checkout.submitStatus);
  const submitError = useAppSelector((state) => state.checkout.submitError);
  const isTokenizing = submitStatus === 'tokenizing';

  // Guards against a tokenize request that resolves/rejects AFTER this
  // container has already unmounted (e.g. the step changed away from
  // DETAILS through some other path while the request was in flight) — a
  // stale result must never dispatch cardTokenized/customer/step SUMMARY.
  //
  // Starts `false` and is set `true` INSIDE the effect body (not at
  // `useRef` init time) so it re-arms on every REAL mount — required for
  // React 18 StrictMode's dev-only mount -> cleanup -> mount cycle: the
  // simulated cleanup sets it `false`, and without resetting it here on
  // the second (real) mount, it would stay permanently `false` for the
  // rest of the component's actual lifetime, silently discarding every
  // future tokenize result (see the identical fix in `ResultContainer`).
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function handleCancel() {
    // Close paths (Cancel button, Escape, backdrop click all route through
    // here) are disabled while a tokenize request is in flight, so the
    // buyer can never race a Continue click against a Cancel/Escape.
    if (isTokenizing) {
      return;
    }
    dispatch(formDraftCleared());
    dispatch(stepChangeRequested('PRODUCT'));
  }

  function handleDraftChange(draft: PaymentFormDraft) {
    dispatch(formDraftSaved(draft));
  }

  async function handleSubmit(values: PaymentFormSubmitValues) {
    dispatch(submitStatusSet('tokenizing'));
    dispatch(submitErrorSet(null));

    try {
      const { cardToken } = await tokenizeCard({
        number: values.cardNumber,
        cvc: values.cvc,
        // The gateway expects 2-digit MM/YY, never a 4-digit year.
        expMonth: String(values.expMonth).padStart(2, '0'),
        expYear: String(values.expYear % 100).padStart(2, '0'),
        cardHolder: values.cardHolder,
      });

      if (!isMountedRef.current) {
        return;
      }

      dispatch(customerAndDeliverySet({ customer: values.customer, delivery: values.delivery }));
      dispatch(installmentsSet(values.installments));
      dispatch(
        cardTokenized({
          cardToken,
          cardSummary: {
            brand: detectCardBrand(values.cardNumber),
            last4: getLast4(values.cardNumber),
            holder: values.cardHolder,
          },
        }),
      );
      dispatch(stepChangeRequested('SUMMARY'));
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Card tokenization failed';
      dispatch(tokenizeFailed(message));
    }
  }

  return (
    <Modal titleId={MODAL_TITLE_ID} title="Payment details" onClose={handleCancel}>
      <PaymentForm
        initialCustomer={customer}
        initialDelivery={delivery}
        initialInstallments={installments}
        initialDraft={formDraft}
        onDraftChange={handleDraftChange}
        showRestoredNotice={draftRestored}
        isSubmitting={submitStatus === 'tokenizing'}
        submitError={submitError}
        onCancel={handleCancel}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
}
