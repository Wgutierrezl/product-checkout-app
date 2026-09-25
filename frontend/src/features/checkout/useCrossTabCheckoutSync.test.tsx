import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { act, render } from '@testing-library/react';
import { useCrossTabCheckoutSync } from './useCrossTabCheckoutSync';
import { checkoutReducer, initialCheckoutState, type CheckoutState } from './checkoutSlice';
import { catalogReducer } from '../catalog/catalogSlice';
import { transactionReducer } from '../transaction/transactionSlice';
import { PERSISTED_VERSION, STORAGE_KEY } from '../../shared/persistence/persistMiddleware';

const KEY = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
const OTHER_KEY = 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70';
const CUSTOMER = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
const DELIVERY = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };
const CARD_SUMMARY = { brand: 'visa' as const, last4: '4242', holder: 'Jane Doe' };

/** This tab: on SUMMARY holding the card token, bound to KEY. */
function buildTabOnSummary(overrides: Partial<CheckoutState> = {}) {
  const checkout: CheckoutState = {
    ...initialCheckoutState,
    step: 'SUMMARY',
    productId: 'p1',
    customer: CUSTOMER,
    delivery: DELIVERY,
    idempotencyKey: KEY,
    cardToken: 'tok_shared_card',
    cardSummary: CARD_SUMMARY,
    ...overrides,
  };
  return configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer },
    preloadedState: { checkout },
  });
}

/** What the OTHER tab's persistMiddleware writes to localStorage. */
function otherTabPayload(
  checkout: Record<string, unknown> = {},
  transaction: Record<string, unknown> = { id: null, status: null, pollStartedAt: null },
) {
  return JSON.stringify({
    version: PERSISTED_VERSION,
    checkout: {
      step: 'SUMMARY',
      productId: 'p1',
      quantity: 1,
      customer: CUSTOMER,
      delivery: DELIVERY,
      installments: 1,
      idempotencyKey: KEY,
      submitAttempted: false,
      formDraft: null,
      ...checkout,
    },
    transaction,
  });
}

function fireStorage(init: StorageEventInit) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', init));
  });
}

function Host() {
  useCrossTabCheckoutSync();
  return null;
}

function renderHost(store: ReturnType<typeof buildTabOnSummary>) {
  return render(
    <Provider store={store}>
      <Host />
    </Provider>,
  );
}

describe('useCrossTabCheckoutSync', () => {
  it('drops the card token and leaves SUMMARY when another tab starts paying under the same key', () => {
    const store = buildTabOnSummary();
    renderHost(store);

    fireStorage({ key: STORAGE_KEY, newValue: otherTabPayload({ submitAttempted: true }) });

    const { checkout } = store.getState();
    expect(checkout.cardToken).toBeNull();
    expect(checkout.cardSummary).toBeNull();
    expect(checkout.step).toBe('DETAILS');
    // Adopted, so this tab's own writes never erase the other tab's in-flight marker.
    expect(checkout.submitAttempted).toBe(true);
    expect(checkout.idempotencyKey).toBe(KEY);
    expect(checkout.submitError).toBe('This checkout continued in another tab.');
  });

  it('follows the other tab to RESULT for the same transaction', () => {
    const store = buildTabOnSummary();
    renderHost(store);

    fireStorage({
      key: STORAGE_KEY,
      newValue: otherTabPayload({ step: 'RESULT' }, { id: KEY, status: 'PENDING', pollStartedAt: 123 }),
    });

    const { checkout, transaction } = store.getState();
    expect(checkout.step).toBe('RESULT');
    expect(checkout.cardToken).toBeNull();
    expect(checkout.submitError).toBeNull();
    expect(transaction).toMatchObject({ id: KEY, status: 'PENDING', pollStartedAt: 123 });
  });

  it('drops the token when the other tab goes back to edit details for the same key', () => {
    const store = buildTabOnSummary();
    renderHost(store);

    fireStorage({ key: STORAGE_KEY, newValue: otherTabPayload({ step: 'DETAILS' }) });

    expect(store.getState().checkout.cardToken).toBeNull();
    expect(store.getState().checkout.step).toBe('DETAILS');
  });

  it.each<[string, StorageEventInit]>([
    ['the other tab is still just sitting on SUMMARY', { key: STORAGE_KEY, newValue: otherTabPayload() }],
    [
      'the other tab uses a different idempotency key',
      { key: STORAGE_KEY, newValue: otherTabPayload({ idempotencyKey: OTHER_KEY, submitAttempted: true }) },
    ],
    ['the change is to another key', { key: 'something-else', newValue: otherTabPayload({ submitAttempted: true }) }],
    ['the value was removed', { key: STORAGE_KEY, newValue: null }],
    ['the value is not valid persisted state', { key: STORAGE_KEY, newValue: '{not json' }],
  ])('ignores the event when %s', (_name, init) => {
    const store = buildTabOnSummary();
    renderHost(store);

    fireStorage(init);

    expect(store.getState().checkout.cardToken).toBe('tok_shared_card');
    expect(store.getState().checkout.step).toBe('SUMMARY');
  });

  it('ignores the event when this tab holds no card token', () => {
    const store = buildTabOnSummary({ cardToken: null, step: 'DETAILS' });
    renderHost(store);

    fireStorage({ key: STORAGE_KEY, newValue: otherTabPayload({ submitAttempted: true }) });

    expect(store.getState().checkout.step).toBe('DETAILS');
    expect(store.getState().checkout.submitAttempted).toBe(false);
  });

  it('ignores the event while this tab is itself paying, so the two tabs never bounce state back and forth', () => {
    // Tab A clicked Pay; tab B adopted and wrote step DETAILS back under the same key.
    const store = buildTabOnSummary({ submitAttempted: true, submitStatus: 'submitting' });
    renderHost(store);

    fireStorage({ key: STORAGE_KEY, newValue: otherTabPayload({ step: 'DETAILS', submitAttempted: true }) });

    const { checkout } = store.getState();
    expect(checkout.step).toBe('SUMMARY');
    expect(checkout.cardToken).toBe('tok_shared_card');
    expect(checkout.submitError).toBeNull();
  });

  it('ignores the event when this tab is not on SUMMARY (e.g. editing details with a leftover token)', () => {
    const store = buildTabOnSummary({ step: 'DETAILS' });
    renderHost(store);

    fireStorage({ key: STORAGE_KEY, newValue: otherTabPayload({ step: 'DETAILS' }) });

    expect(store.getState().checkout.submitError).toBeNull();
    expect(store.getState().checkout.cardToken).toBe('tok_shared_card');
  });

  it('stops listening on unmount', () => {
    const store = buildTabOnSummary();
    const { unmount } = renderHost(store);
    unmount();

    fireStorage({ key: STORAGE_KEY, newValue: otherTabPayload({ submitAttempted: true }) });

    expect(store.getState().checkout.cardToken).toBe('tok_shared_card');
  });
});
