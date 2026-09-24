import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { canEnterStep, type CheckoutStep, type StepPrerequisites } from '../../domain/checkout/stepMachine';
import { generateIdempotencyKey } from '../../domain/checkout/idempotencyKey';
import type { CardBrand } from '../../domain/card/brand';
import type { CustomerInput, DeliveryInput } from '../../api/types';

export type SubmitStatus = 'idle' | 'tokenizing' | 'fetchingAcceptance' | 'submitting' | 'failed';

export interface CardSummary {
  brand: CardBrand;
  last4: string;
  holder: string;
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
   * Single-use gateway token. Intentionally excluded from the persistence
   * whitelist (see `shared/persistence/persistMiddleware.ts`) — it lives in
   * Redux state for the current session only, never in localStorage.
   */
  cardToken: string | null;
  submitStatus: SubmitStatus;
  submitError: string | null;
}

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
    checkoutReset: () => initialCheckoutState,
  },
});

export const {
  productSelected,
  stepChangeRequested,
  customerAndDeliverySet,
  installmentsSet,
  idempotencyKeyEnsured,
  idempotencyKeyRotated,
  cardTokenized,
  cardTokenConsumed,
  tokenizeFailed,
  submitStatusSet,
  submitErrorSet,
  checkoutReset,
} = checkoutSlice.actions;

export const checkoutReducer = checkoutSlice.reducer;
