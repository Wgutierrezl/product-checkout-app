import { configureStore } from '@reduxjs/toolkit';
import {
  cardTokenConsumed,
  cardTokenized,
  checkoutReducer,
  checkoutReset,
  customerAndDeliverySet,
  formDraftCleared,
  formDraftSaved,
  idempotencyKeyEnsured,
  idempotencyKeyRotated,
  installmentsSet,
  paymentAttemptResolved,
  paymentAttemptStarted,
  productSelected,
  stepChangeRequested,
  stepForced,
  submitErrorSet,
  submitStatusSet,
  tokenizeFailed,
} from './checkoutSlice';

function buildStore() {
  return configureStore({ reducer: { checkout: checkoutReducer } });
}

const CUSTOMER = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
const DELIVERY = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };
const CARD_SUMMARY = { brand: 'visa' as const, last4: '1111', holder: 'Jane Doe' };

describe('checkoutSlice', () => {
  it('starts on PRODUCT with no selection, no card data, and idle submit status', () => {
    const store = buildStore();

    expect(store.getState().checkout).toEqual({
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
    });
  });

  it('sets productId/quantity on productSelected without changing the step', () => {
    const store = buildStore();

    store.dispatch(productSelected({ productId: 'p1', quantity: 3 }));

    expect(store.getState().checkout.step).toBe('PRODUCT');
    expect(store.getState().checkout.productId).toBe('p1');
    expect(store.getState().checkout.quantity).toBe(3);
  });

  describe('stepChangeRequested (blocked progression)', () => {
    it('blocks moving to DETAILS with no product selected', () => {
      const store = buildStore();

      store.dispatch(stepChangeRequested('DETAILS'));

      expect(store.getState().checkout.step).toBe('PRODUCT');
    });

    it('allows moving to DETAILS once a product is selected', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));

      store.dispatch(stepChangeRequested('DETAILS'));

      expect(store.getState().checkout.step).toBe('DETAILS');
    });

    it('blocks moving to SUMMARY without customer/delivery data', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));

      store.dispatch(stepChangeRequested('SUMMARY'));

      expect(store.getState().checkout.step).toBe('PRODUCT');
    });

    it('allows moving to SUMMARY once product + customer/delivery are set', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
      store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));

      store.dispatch(stepChangeRequested('SUMMARY'));

      expect(store.getState().checkout.step).toBe('SUMMARY');
    });
  });

  it('sets customer and delivery via customerAndDeliverySet', () => {
    const store = buildStore();

    store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));

    expect(store.getState().checkout.customer).toEqual(CUSTOMER);
    expect(store.getState().checkout.delivery).toEqual(DELIVERY);
  });

  it('sets installments via installmentsSet', () => {
    const store = buildStore();

    store.dispatch(installmentsSet(6));

    expect(store.getState().checkout.installments).toBe(6);
  });

  describe('idempotency key lifecycle', () => {
    it('generates a key on idempotencyKeyEnsured when none exists', () => {
      const store = buildStore();

      store.dispatch(idempotencyKeyEnsured());

      expect(store.getState().checkout.idempotencyKey).toEqual(expect.any(String));
    });

    it('keeps the same key on a second idempotencyKeyEnsured call (reuse across retries)', () => {
      const store = buildStore();
      store.dispatch(idempotencyKeyEnsured());
      const firstKey = store.getState().checkout.idempotencyKey;

      store.dispatch(idempotencyKeyEnsured());

      expect(store.getState().checkout.idempotencyKey).toBe(firstKey);
    });

    it('generates a brand new key on idempotencyKeyRotated (backend already responded)', () => {
      const store = buildStore();
      store.dispatch(idempotencyKeyEnsured());
      const firstKey = store.getState().checkout.idempotencyKey;

      store.dispatch(idempotencyKeyRotated());

      expect(store.getState().checkout.idempotencyKey).not.toBe(firstKey);
    });
  });

  describe('card tokenization outcome', () => {
    it('stores the token and card summary on cardTokenized, clearing any prior submit error', () => {
      const store = buildStore();
      store.dispatch(tokenizeFailed('boom'));

      store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));

      const state = store.getState().checkout;
      expect(state.cardToken).toBe('tok_test_card');
      expect(state.cardSummary).toEqual(CARD_SUMMARY);
      expect(state.submitStatus).toBe('idle');
      expect(state.submitError).toBeNull();
    });

    it('ensures an idempotency key the moment a card is tokenized, so every tab holding this token pays under it', () => {
      const store = buildStore();

      store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));

      expect(store.getState().checkout.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('keeps an existing idempotency key when a card is tokenized again (same checkout attempt)', () => {
      const store = buildStore();
      store.dispatch(idempotencyKeyEnsured());
      const existingKey = store.getState().checkout.idempotencyKey;

      store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));

      expect(store.getState().checkout.idempotencyKey).toBe(existingKey);
    });

    it('sets submitStatus to failed and records the error on tokenizeFailed, without setting a token', () => {
      const store = buildStore();

      store.dispatch(tokenizeFailed('Card tokenization failed'));

      const state = store.getState().checkout;
      expect(state.submitStatus).toBe('failed');
      expect(state.submitError).toBe('Card tokenization failed');
      expect(state.cardToken).toBeNull();
      expect(state.cardSummary).toBeNull();
    });
  });

  it('nulls only the cardToken via cardTokenConsumed, keeping cardSummary/customer/delivery intact', () => {
    const store = buildStore();
    const CARD_SUMMARY = { brand: 'visa' as const, last4: '1111', holder: 'Jane Doe' };
    store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));
    store.dispatch(
      customerAndDeliverySet({
        customer: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' },
        delivery: { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' },
      }),
    );

    store.dispatch(cardTokenConsumed());

    const state = store.getState().checkout;
    expect(state.cardToken).toBeNull();
    expect(state.cardSummary).toEqual(CARD_SUMMARY);
    expect(state.customer).not.toBeNull();
    expect(state.delivery).not.toBeNull();
  });

  it('sets submitStatus via submitStatusSet', () => {
    const store = buildStore();

    store.dispatch(submitStatusSet('submitting'));

    expect(store.getState().checkout.submitStatus).toBe('submitting');
  });

  it('sets submitError via submitErrorSet', () => {
    const store = buildStore();

    store.dispatch(submitErrorSet('Insufficient stock'));

    expect(store.getState().checkout.submitError).toBe('Insufficient stock');
  });

  it('clears submitError via submitErrorSet(null)', () => {
    const store = buildStore();
    store.dispatch(submitErrorSet('Insufficient stock'));

    store.dispatch(submitErrorSet(null));

    expect(store.getState().checkout.submitError).toBeNull();
  });

  it('resets to the initial state on checkoutReset (e.g. Back to store)', () => {
    const store = buildStore();
    store.dispatch(productSelected({ productId: 'p1', quantity: 3 }));
    store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));
    store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));

    store.dispatch(checkoutReset());

    expect(store.getState().checkout).toEqual({
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
    });
  });

  describe('in-flight payment attempt tracking (submitAttempted)', () => {
    it('marks submitAttempted true via paymentAttemptStarted', () => {
      const store = buildStore();

      store.dispatch(paymentAttemptStarted());

      expect(store.getState().checkout.submitAttempted).toBe(true);
    });

    it('marks submitAttempted false via paymentAttemptResolved', () => {
      const store = buildStore();
      store.dispatch(paymentAttemptStarted());

      store.dispatch(paymentAttemptResolved());

      expect(store.getState().checkout.submitAttempted).toBe(false);
    });
  });

  describe('stepForced (bypasses canEnterStep prerequisites)', () => {
    it('sets the step directly, even when normal prerequisites are not met', () => {
      const store = buildStore();
      expect(store.getState().checkout.cardToken).toBeNull();

      store.dispatch(stepForced('RESULT'));

      expect(store.getState().checkout.step).toBe('RESULT');
    });

    it('can force any step, e.g. back to DETAILS', () => {
      const store = buildStore();
      store.dispatch(stepForced('RESULT'));

      store.dispatch(stepForced('DETAILS'));

      expect(store.getState().checkout.step).toBe('DETAILS');
    });
  });

  describe('payment form draft (non-card fields only)', () => {
    const DRAFT = {
      cardHolder: 'Jane Doe',
      installments: 3,
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phoneCountry: 'CO',
      phoneNational: '3001234567',
      address: 'Cra 1 # 2-3',
      city: 'Bogota',
      region: 'Cundinamarca',
      postalCode: '110111',
    };
    const EMPTY_DRAFT = {
      cardHolder: '',
      installments: 1,
      fullName: '',
      email: '',
      phoneCountry: 'CO',
      phoneNational: '',
      address: '',
      city: '',
      region: '',
      postalCode: '',
    };

    it('stores the draft on formDraftSaved', () => {
      const store = buildStore();

      store.dispatch(formDraftSaved(DRAFT));

      expect(store.getState().checkout.formDraft).toEqual(DRAFT);
    });

    it('stores nothing for a draft the buyer has not filled in at all', () => {
      const store = buildStore();
      store.dispatch(formDraftSaved(DRAFT));

      store.dispatch(formDraftSaved(EMPTY_DRAFT));

      expect(store.getState().checkout.formDraft).toBeNull();
    });

    it('treats a draft with only a non-default installments choice as filled in', () => {
      const store = buildStore();

      store.dispatch(formDraftSaved({ ...EMPTY_DRAFT, installments: 6 }));

      expect(store.getState().checkout.formDraft).toEqual({ ...EMPTY_DRAFT, installments: 6 });
    });

    it('drops the draft and the restored flag on formDraftCleared (cancel)', () => {
      const store = configureStore({
        reducer: { checkout: checkoutReducer },
        preloadedState: { checkout: { ...buildStore().getState().checkout, formDraft: DRAFT, draftRestored: true } },
      });

      store.dispatch(formDraftCleared());

      expect(store.getState().checkout.formDraft).toBeNull();
      expect(store.getState().checkout.draftRestored).toBe(false);
    });

    it('drops the draft on checkoutReset (completed checkout)', () => {
      const store = buildStore();
      store.dispatch(formDraftSaved(DRAFT));

      store.dispatch(checkoutReset());

      expect(store.getState().checkout.formDraft).toBeNull();
    });

    it('drops the draft (personal data) once a submitted payment reaches RESULT', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
      store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));
      store.dispatch(formDraftSaved(DRAFT));
      store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));

      store.dispatch(stepChangeRequested('RESULT'));

      expect(store.getState().checkout.step).toBe('RESULT');
      expect(store.getState().checkout.formDraft).toBeNull();
    });

    it('keeps the draft when a RESULT transition is refused', () => {
      const store = buildStore();
      store.dispatch(formDraftSaved(DRAFT));

      store.dispatch(stepChangeRequested('RESULT'));

      expect(store.getState().checkout.formDraft).toEqual(DRAFT);
    });

    it('drops the draft when a resumed payment forces RESULT', () => {
      const store = buildStore();
      store.dispatch(formDraftSaved(DRAFT));

      store.dispatch(stepForced('RESULT'));

      expect(store.getState().checkout.formDraft).toBeNull();
    });

    it('turns off the restored flag once a card is tokenized again this session', () => {
      const store = configureStore({
        reducer: { checkout: checkoutReducer },
        preloadedState: { checkout: { ...buildStore().getState().checkout, formDraft: DRAFT, draftRestored: true } },
      });

      store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));

      expect(store.getState().checkout.draftRestored).toBe(false);
      expect(store.getState().checkout.formDraft).toEqual(DRAFT);
    });
  });
});
