import { configureStore } from '@reduxjs/toolkit';
import { catalogReducer } from '../../features/catalog/catalogSlice';
import {
  cardTokenized,
  checkoutReducer,
  customerAndDeliverySet,
  productSelected,
  stepChangeRequested,
  submitStatusSet,
} from '../../features/checkout/checkoutSlice';
import { pollStarted, transactionReceived, transactionReducer } from '../../features/transaction/transactionSlice';
import { clearPersistedState, loadPersistedState, persistMiddleware, STORAGE_KEY } from './persistMiddleware';

const CUSTOMER = { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+573001234567' };
const DELIVERY = { address: 'Cra 1 # 2-3', city: 'Bogota', region: 'Cundinamarca' };
const CARD_SUMMARY = { brand: 'visa' as const, last4: '1111', holder: 'Jane Doe' };
const AMOUNTS = { productAmount: 300_000, baseFee: 250_000, deliveryFee: 800_000, total: 1_350_000, currency: 'COP' as const };

function buildStore() {
  return configureStore({
    reducer: { catalog: catalogReducer, checkout: checkoutReducer, transaction: transactionReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(persistMiddleware),
  });
}

function readPersisted(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
}

describe('persistMiddleware', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists whitelisted checkout and transaction fields after an action', () => {
    const store = buildStore();

    store.dispatch(productSelected({ productId: 'p1', quantity: 2 }));
    store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));

    const persisted = readPersisted();
    expect(persisted).toMatchObject({
      version: 1,
      checkout: expect.objectContaining({
        productId: 'p1',
        quantity: 2,
        customer: CUSTOMER,
        delivery: DELIVERY,
      }),
    });
  });

  it('never writes cardToken, submitStatus, submitError, or the catalog slice to storage', () => {
    const store = buildStore();

    store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
    store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));
    store.dispatch(submitStatusSet('submitting'));

    const persisted = readPersisted();
    expect(persisted).not.toHaveProperty('catalog');
    expect(persisted.checkout).not.toHaveProperty('cardToken');
    expect(persisted.checkout).not.toHaveProperty('submitStatus');
    expect(persisted.checkout).not.toHaveProperty('submitError');
    expect(JSON.stringify(persisted)).not.toContain('tok_test_card');
  });

  it('persists cardSummary (safe display data) but not the raw card token', () => {
    const store = buildStore();

    store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));

    const persisted = readPersisted();
    expect(persisted.checkout).toMatchObject({ cardSummary: CARD_SUMMARY });
  });

  it('persists whitelisted transaction fields, not amounts/error', () => {
    const store = buildStore();

    store.dispatch(transactionReceived({ id: 't1', status: 'PENDING', amounts: AMOUNTS }));
    store.dispatch(pollStarted(123456));

    const persisted = readPersisted();
    expect(persisted.transaction).toEqual({ id: 't1', status: 'PENDING', pollStartedAt: 123456 });
  });

  describe('loadPersistedState', () => {
    it('returns undefined when nothing is stored', () => {
      expect(loadPersistedState()).toBeUndefined();
    });

    it('returns undefined and clears storage when the payload is malformed JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{not json');

      expect(loadPersistedState()).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('returns undefined and clears storage when the payload is valid JSON but not an object', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(42));

      expect(loadPersistedState()).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('returns undefined and clears storage on a version mismatch', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 999, checkout: { step: 'DETAILS' }, transaction: {} }),
      );

      expect(loadPersistedState()).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('rehydrates a valid persisted state as-is when step is not SUMMARY', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
      store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));
      store.dispatch(stepChangeRequested('DETAILS'));

      const rehydrated = loadPersistedState();

      expect(rehydrated?.checkout).toMatchObject({ step: 'DETAILS', customer: CUSTOMER, delivery: DELIVERY });
    });

    it('downgrades a persisted SUMMARY step to DETAILS and clears cardSummary', () => {
      const store = buildStore();
      store.dispatch(productSelected({ productId: 'p1', quantity: 1 }));
      store.dispatch(customerAndDeliverySet({ customer: CUSTOMER, delivery: DELIVERY }));
      store.dispatch(cardTokenized({ cardToken: 'tok_test_card', cardSummary: CARD_SUMMARY }));
      store.dispatch(stepChangeRequested('DETAILS'));
      store.dispatch(stepChangeRequested('SUMMARY'));

      const rehydrated = loadPersistedState();

      expect(rehydrated?.checkout).toMatchObject({
        step: 'DETAILS',
        cardSummary: null,
        customer: CUSTOMER,
        delivery: DELIVERY,
      });
    });
  });

  describe('clearPersistedState', () => {
    it('removes the storage key entirely', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, checkout: {}, transaction: {} }));

      clearPersistedState();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
