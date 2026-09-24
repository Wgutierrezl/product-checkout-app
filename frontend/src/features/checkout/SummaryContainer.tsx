import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '../../app/hooks';
import { fetchProducts } from '../catalog/catalogThunks';
import { Summary } from './Summary';
import {
  cardTokenConsumed,
  idempotencyKeyEnsured,
  idempotencyKeyRotated,
  stepChangeRequested,
  submitErrorSet,
  submitStatusSet,
} from './checkoutSlice';
import { transactionReceived } from '../transaction/transactionSlice';
import { createTransaction, fetchPaymentAcceptance } from '../../api/backendClient';
import { BackendApiError } from '../../api/types';
import type { PaymentAcceptance } from '../../api/types';

/** A definite backend rejection: the request was received and processed to a negative, final conclusion. */
function isDefiniteRejection(status: number): boolean {
  return status === 400 || status === 409;
}

/**
 * The SUMMARY step: a Material-style backdrop (dimmed selected-product
 * context behind a sliding-up summary sheet). Fetches payment-acceptance
 * links once on mount (for the checkbox permalinks) and AGAIN, always
 * fresh, immediately before every Pay attempt — acceptance tokens are
 * never reused across attempts (spec: Acceptance Token Freshness).
 */
export function SummaryContainer() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const items = useAppSelector((state) => state.catalog.items);
  const productId = useAppSelector((state) => state.checkout.productId);
  const quantity = useAppSelector((state) => state.checkout.quantity);
  const customer = useAppSelector((state) => state.checkout.customer);
  const delivery = useAppSelector((state) => state.checkout.delivery);
  const cardSummary = useAppSelector((state) => state.checkout.cardSummary);
  const cardToken = useAppSelector((state) => state.checkout.cardToken);
  const installments = useAppSelector((state) => state.checkout.installments);
  const submitStatus = useAppSelector((state) => state.checkout.submitStatus);
  const submitError = useAppSelector((state) => state.checkout.submitError);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [personalDataAccepted, setPersonalDataAccepted] = useState(false);
  const [acceptance, setAcceptance] = useState<PaymentAcceptance | null>(null);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPaymentAcceptance()
      .then((result) => {
        if (!cancelled) {
          setAcceptance(result);
          setAcceptanceError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAcceptanceError(error instanceof Error ? error.message : 'Could not load payment terms.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const product = items.find((item) => item.id === productId) ?? null;
  const isSubmitting = submitStatus === 'submitting' || submitStatus === 'fetchingAcceptance';

  function handleEditDetails() {
    // Click (button `disabled`), Escape, and any future close path all
    // route through here — mirrors PaymentModalContainer's `handleCancel`
    // guard against closing while a request is in flight.
    if (isSubmitting) {
      return;
    }
    dispatch(stepChangeRequested('DETAILS'));
  }

  async function handlePay() {
    if (isSubmitting) {
      return;
    }
    if (!productId || !customer || !delivery || !cardToken) {
      dispatch(submitErrorSet('Missing checkout details. Please start again.'));
      dispatch(stepChangeRequested('DETAILS'));
      return;
    }

    dispatch(submitStatusSet('fetchingAcceptance'));
    dispatch(submitErrorSet(null));

    let freshAcceptance: PaymentAcceptance;
    try {
      // ALWAYS fetched fresh here — the mount-time `acceptance` in local
      // state is only ever used to render the checkbox links, never reused
      // for the actual submission.
      freshAcceptance = await fetchPaymentAcceptance();
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      dispatch(submitErrorSet(error instanceof Error ? error.message : 'Could not load payment terms.'));
      dispatch(submitStatusSet('failed'));
      return;
    }

    if (!isMountedRef.current) {
      return;
    }

    dispatch(idempotencyKeyEnsured());
    const idempotencyKey = store.getState().checkout.idempotencyKey as string;
    dispatch(submitStatusSet('submitting'));

    try {
      const transaction = await createTransaction({
        idempotencyKey,
        productId,
        quantity,
        customer,
        delivery,
        cardToken,
        installments,
        acceptanceToken: freshAcceptance.acceptanceToken,
        acceptPersonalAuth: freshAcceptance.acceptPersonalAuth,
      });

      if (!isMountedRef.current) {
        return;
      }

      dispatch(
        transactionReceived({
          id: transaction.id,
          status: transaction.status,
          amounts: {
            productAmount: transaction.productAmount,
            baseFee: transaction.baseFee,
            deliveryFee: transaction.deliveryFee,
            total: transaction.total,
            currency: transaction.currency,
          },
        }),
      );
      // MUST fire before cardTokenConsumed(): checkoutSlice's RESULT
      // prerequisite checks `cardToken !== null` (see checkoutSlice.ts).
      dispatch(stepChangeRequested('RESULT'));
      dispatch(cardTokenConsumed());
      dispatch(idempotencyKeyRotated());
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      if (error instanceof BackendApiError) {
        if (error.status === 409) {
          dispatch(submitErrorSet(error.message));
          dispatch(cardTokenConsumed());
          dispatch(stepChangeRequested('PRODUCT'));
          dispatch(fetchProducts());
          dispatch(submitStatusSet('failed'));
          return;
        }
        if (isDefiniteRejection(error.status)) {
          dispatch(submitErrorSet(error.message));
          dispatch(cardTokenConsumed());
          dispatch(idempotencyKeyRotated());
          dispatch(stepChangeRequested('DETAILS'));
          dispatch(submitStatusSet('failed'));
          return;
        }
        // status 0 (network) or 5xx: AMBIGUOUS — the backend may never have
        // received the request, so the same idempotencyKey is safe (and
        // required) to reuse on retry; stay on SUMMARY.
        dispatch(submitErrorSet(error.message));
        dispatch(submitStatusSet('failed'));
        return;
      }

      dispatch(submitErrorSet(error instanceof Error ? error.message : 'Payment failed. Please try again.'));
      dispatch(submitStatusSet('failed'));
    }
  }

  return (
    <Summary
      product={product ? { name: product.name, imageUrl: product.imageUrl, quantity, price: product.price } : null}
      cardSummary={cardSummary}
      delivery={delivery}
      acceptanceLinks={
        acceptance
          ? { termsUrl: acceptance.acceptanceTokenPermalink, personalDataUrl: acceptance.acceptPersonalAuthPermalink }
          : null
      }
      acceptanceError={acceptanceError}
      termsAccepted={termsAccepted}
      personalDataAccepted={personalDataAccepted}
      onToggleTerms={() => setTermsAccepted((current) => !current)}
      onTogglePersonalData={() => setPersonalDataAccepted((current) => !current)}
      isSubmitting={isSubmitting}
      submitError={submitError}
      onPay={handlePay}
      onEditDetails={handleEditDetails}
    />
  );
}
