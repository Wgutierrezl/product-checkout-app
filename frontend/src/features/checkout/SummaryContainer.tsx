import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '../../app/hooks';
import { fetchProducts } from '../catalog/catalogThunks';
import { Summary } from './Summary';
import {
  cardTokenConsumed,
  idempotencyKeyEnsured,
  idempotencyKeyRotated,
  paymentAttemptResolved,
  paymentAttemptStarted,
  stepChangeRequested,
  submitErrorSet,
  submitStatusSet,
} from './checkoutSlice';
import { pollStarted, transactionReceived } from '../transaction/transactionSlice';
import { createTransaction, fetchPaymentAcceptance } from '../../api/backendClient';
import { BackendApiError } from '../../api/types';
import type { PaymentAcceptance } from '../../api/types';

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
    // Persisted (see persistMiddleware) right before the risky network call,
    // so a refresh mid-request can be resolved later via resumeInFlightPayment
    // instead of blindly rotating the key.
    dispatch(paymentAttemptStarted());

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
          reference: transaction.reference,
          amounts: {
            productAmount: transaction.productAmount,
            baseFee: transaction.baseFee,
            deliveryFee: transaction.deliveryFee,
            total: transaction.total,
            currency: transaction.currency,
          },
        }),
      );
      // Marks the start of the RESULT step's polling window; the RESULT
      // container resumes from this timestamp even across a refresh (see
      // pollTransactionThunk.ts).
      dispatch(pollStarted(Date.now()));
      // MUST fire before cardTokenConsumed(): checkoutSlice's RESULT
      // prerequisite checks `cardToken !== null` (see checkoutSlice.ts).
      dispatch(stepChangeRequested('RESULT'));
      dispatch(cardTokenConsumed());
      dispatch(paymentAttemptResolved());
      // NOT rotated here: a 201/PENDING response is not yet a definitive
      // outcome (the transaction may still settle to DECLINED/ERROR via
      // polling). The idempotencyKey is only rotated on a definite outcome
      // -- a 400 rejection, or an explicit "Try again" after a final
      // DECLINED/ERROR/VOIDED -- see the RESULT step's retry handling.
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
          dispatch(paymentAttemptResolved());
          return;
        }
        if (error.status === 400) {
          // DEFINITE rejection: the backend validated and rejected the
          // request outright. Safe to rotate -- the backend already
          // recorded a definitive outcome under the old key.
          dispatch(submitErrorSet(error.message));
          dispatch(cardTokenConsumed());
          dispatch(idempotencyKeyRotated());
          dispatch(stepChangeRequested('DETAILS'));
          dispatch(submitStatusSet('failed'));
          dispatch(paymentAttemptResolved());
          return;
        }
        if (error.status === 0) {
          // Network/client-side failure: the request never reached the
          // backend, so the card token was never spent -- keep it (and the
          // SAME key) for a same-tap retry from SUMMARY, no re-tokenize needed.
          dispatch(submitErrorSet(error.message));
          dispatch(submitStatusSet('failed'));
          dispatch(paymentAttemptResolved());
          return;
        }
        // 5xx: the backend DID receive the request and may have forwarded
        // it to the gateway before failing -- we can't be sure the token
        // wasn't already spent, so treat it as consumed and route back to
        // DETAILS to re-tokenize. The idempotencyKey is deliberately KEPT
        // (not rotated): retrying under the SAME key is an idempotent
        // replay on the backend (it returns the existing record instead of
        // charging again -- see create-transaction.use-case.ts), so reuse
        // here can never cause a double charge.
        dispatch(submitErrorSet(error.message));
        dispatch(cardTokenConsumed());
        dispatch(stepChangeRequested('DETAILS'));
        dispatch(submitStatusSet('failed'));
        dispatch(paymentAttemptResolved());
        return;
      }

      dispatch(submitErrorSet(error instanceof Error ? error.message : 'Payment failed. Please try again.'));
      dispatch(submitStatusSet('failed'));
      dispatch(paymentAttemptResolved());
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
