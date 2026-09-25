import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { canEnterStep, type CheckoutStep, type StepPrerequisites } from '../../domain/checkout/stepMachine';
import { generateIdempotencyKey } from '../../domain/checkout/idempotencyKey';
import type { CardBrand } from '../../domain/card/brand';
import type { CustomerInput, DeliveryInput, TransactionStatus } from '../../api/types';

export type SubmitStatus = 'idle' | 'tokenizing' | 'fetchingAcceptance' | 'submitting' | 'failed';

export interface CardSummary {
  brand: CardBrand;
  last4: string;
  holder: string;
}

/**
 * What the DETAILS form keeps while the buyer types, so a refresh does not
 * lose it. Deliberately has NO card number, expiry or CVC field: those are
 * never stored anywhere. The cardholder name is not card data on its own.
 */
export interface PaymentFormDraft {
  cardHolder: string;
  installments: number;
  fullName: string;
  email: string;
  /** ISO2 of the selected phone country (the dial code is derived from it). */
  phoneCountry: string;
  /** Digits-only national number, without the dial code. */
  phoneNational: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
}

const DRAFT_TEXT_FIELDS = [
  'cardHolder',
  'fullName',
  'email',
  'phoneNational',
  'address',
  'city',
  'region',
  'postalCode',
] as const satisfies readonly (keyof PaymentFormDraft)[];

/** True when the buyer has not typed or chosen anything worth keeping yet. */
function isBlankDraft(draft: PaymentFormDraft): boolean {
  return draft.installments === 1 && DRAFT_TEXT_FIELDS.every((field) => draft[field].trim() === '');
}

export interface CheckoutState {
  step: CheckoutStep;
  productId: string | null;
  quantity: number;
  customer: CustomerInput | null;
  delivery: DeliveryInput | null;
  installments: number;
  idempotencyKey: string | null;
  /** Never number/CVC/token — only what's safe to display back to the buyer. */
  cardSummary: CardSummary | null;
  /**
   * Single-use gateway token. Never written to localStorage. While the buyer
   * is on SUMMARY it is mirrored (with `cardSummary`) to sessionStorage so a
   * refresh in the same tab keeps SUMMARY, and removed the moment it is
   * spent or no longer needed (see `shared/persistence/persistMiddleware.ts`).
   */
  cardToken: string | null;
  submitStatus: SubmitStatus;
  submitError: string | null;
  /**
   * True from the moment `POST /transactions` is about to be sent until its
   * outcome is known. Persisted alongside `idempotencyKey` so a refresh
   * mid-request can be resolved via `GET /transactions/:idempotencyKey`
   * (the backend uses the idempotencyKey AS the transaction id) instead of
   * blindly rotating the key, which could otherwise let a request that DID
   * reach the backend be charged a second time under a new, untracked key.
   * See `features/checkout/resumeInFlightPayment.ts`.
   */
  submitAttempted: boolean;
  /** Debounced snapshot of the DETAILS form (persisted). `null` when blank. */
  formDraft: PaymentFormDraft | null;
  /**
   * True when this page load rehydrated a draft from storage (never
   * persisted itself). Drives the "re-enter your card" notice.
   */
  draftRestored: boolean;
}

/** The checkout fields every tab shares through localStorage. */
export type SharedCheckoutFields = Pick<
  CheckoutState,
  | 'step'
  | 'productId'
  | 'quantity'
  | 'customer'
  | 'delivery'
  | 'installments'
  | 'idempotencyKey'
  | 'submitAttempted'
  | 'formDraft'
>;

export interface SharedTransactionFields {
  id: string | null;
  status: TransactionStatus | null;
  pollStartedAt: number | null;
}

export const OTHER_TAB_MESSAGE = 'This checkout continued in another tab.';

/**
 * Another tab holding the SAME card token (a duplicated tab) started paying
 * or moved on from SUMMARY under the same idempotency key. This tab drops
 * its token and adopts that tab's shared state, so it never pays a second
 * time and its own localStorage writes never erase the other tab's
 * in-flight marker or transaction. Handled by both the checkout and the
 * transaction slices.
 */
export const otherTabStateAdopted = createAction<{
  checkout: SharedCheckoutFields;
  transaction: SharedTransactionFields;
}>('checkout/otherTabStateAdopted');

export const initialCheckoutState: CheckoutState = {
  step: 'PRODUCT',
  productId: null,
  quantity: 1,
  customer: null,
  delivery: null,
  installments: 1,
  idempotencyKey: null,
  cardSummary: null,
  cardToken: null,
  submitStatus: 'idle',
  submitError: null,
  submitAttempted: false,
  formDraft: null,
  draftRestored: false,
};

/**
 * `hasSubmittedPayment` only reflects what THIS slice can see (a tokenized
 * card). The RESULT step actually depends on a created transaction, which
 * lives in `transactionSlice` — the PR6/7 submit thunk/container combines
 * both slices via `stepMachine.canEnterStep` directly before dispatching a
 * transition to RESULT. This local check is a conservative floor, not the
 * full RESULT gate.
 */
function prerequisitesFrom(state: CheckoutState): StepPrerequisites {
  return {
    hasProductSelection: state.productId !== null,
    hasCustomerAndDelivery: state.customer !== null && state.delivery !== null,
    hasSubmittedPayment: state.cardToken !== null,
  };
}

const checkoutSlice = createSlice({
  name: 'checkout',
  initialState: initialCheckoutState,
  reducers: {
    productSelected: (state, action: PayloadAction<{ productId: string; quantity: number }>) => {
      state.productId = action.payload.productId;
      state.quantity = action.payload.quantity;
    },
    stepChangeRequested: (state, action: PayloadAction<CheckoutStep>) => {
      if (canEnterStep(action.payload, prerequisitesFrom(state))) {
        state.step = action.payload;
      }
    },
    /**
     * Sets the step directly, bypassing `canEnterStep`. Reserved for
     * `resumeInFlightPayment`: after a refresh, the in-memory `cardToken`
     * that `stepChangeRequested('RESULT')` normally requires is legitimately
     * gone, even though a transaction genuinely exists and was confirmed via
     * `GET /transactions/:idempotencyKey`. Not a general-purpose escape
     * hatch — every other transition should go through `stepChangeRequested`.
     */
    stepForced: (state, action: PayloadAction<CheckoutStep>) => {
      state.step = action.payload;
    },
    customerAndDeliverySet: (
      state,
      action: PayloadAction<{ customer: CustomerInput; delivery: DeliveryInput }>,
    ) => {
      state.customer = action.payload.customer;
      state.delivery = action.payload.delivery;
    },
    installmentsSet: (state, action: PayloadAction<number>) => {
      state.installments = action.payload;
    },
    idempotencyKeyEnsured: (state) => {
      if (!state.idempotencyKey) {
        state.idempotencyKey = generateIdempotencyKey();
      }
    },
    idempotencyKeyRotated: (state) => {
      state.idempotencyKey = generateIdempotencyKey();
    },
    cardTokenized: (state, action: PayloadAction<{ cardToken: string; cardSummary: CardSummary }>) => {
      state.cardToken = action.payload.cardToken;
      state.cardSummary = action.payload.cardSummary;
      state.draftRestored = false;
      // The token is bound to ONE idempotency key from the moment it exists,
      // and that key is persisted with it. A duplicated tab therefore pays
      // under the same key, which the backend replays instead of charging
      // twice (the sandbox gateway does not reject a reused token itself).
      if (!state.idempotencyKey) {
        state.idempotencyKey = generateIdempotencyKey();
      }
      state.submitStatus = 'idle';
      state.submitError = null;
    },
    /**
     * Nulls ONLY the single-use gateway token, leaving `cardSummary` (safe
     * display data) and everything else untouched. Used once a token has
     * been spent one way or another: a successful `POST /transactions`, or
     * any backend response that means the token can no longer be trusted
     * for a retry (see design Amendment).
     */
    cardTokenConsumed: (state) => {
      state.cardToken = null;
    },
    tokenizeFailed: (state, action: PayloadAction<string>) => {
      state.cardToken = null;
      state.cardSummary = null;
      state.submitStatus = 'failed';
      state.submitError = action.payload;
    },
    submitStatusSet: (state, action: PayloadAction<SubmitStatus>) => {
      state.submitStatus = action.payload;
    },
    submitErrorSet: (state, action: PayloadAction<string | null>) => {
      state.submitError = action.payload;
    },
    /** Dispatched right before `POST /transactions` is sent. See `submitAttempted`. */
    paymentAttemptStarted: (state) => {
      state.submitAttempted = true;
    },
    /** Dispatched once the outcome of that request is known (any resolution), or resolved via `resumeInFlightPayment`. */
    paymentAttemptResolved: (state) => {
      state.submitAttempted = false;
    },
    formDraftSaved: (state, action: PayloadAction<PaymentFormDraft>) => {
      state.formDraft = isBlankDraft(action.payload) ? null : action.payload;
    },
    /** The buyer cancelled the form: forget what they had typed. */
    formDraftCleared: (state) => {
      state.formDraft = null;
      state.draftRestored = false;
    },
    checkoutReset: () => initialCheckoutState,
  },
  extraReducers: (builder) => {
    builder.addCase(otherTabStateAdopted, (state, action) => {
      const shared = action.payload.checkout;
      // Without the token this tab cannot sit on SUMMARY.
      const step = shared.step === 'SUMMARY' ? 'DETAILS' : shared.step;
      return {
        ...state,
        ...shared,
        step,
        cardToken: null,
        cardSummary: null,
        submitStatus: 'idle',
        submitError: step === 'DETAILS' ? OTHER_TAB_MESSAGE : null,
        draftRestored: false,
      };
    });
  },
});

export const {
  productSelected,
  stepChangeRequested,
  stepForced,
  customerAndDeliverySet,
  installmentsSet,
  idempotencyKeyEnsured,
  idempotencyKeyRotated,
  cardTokenized,
  cardTokenConsumed,
  tokenizeFailed,
  submitStatusSet,
  submitErrorSet,
  paymentAttemptStarted,
  paymentAttemptResolved,
  formDraftSaved,
  formDraftCleared,
  checkoutReset,
} = checkoutSlice.actions;

export const checkoutReducer = checkoutSlice.reducer;
